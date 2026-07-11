// Per-user quota/credit gating in front of lib/llm.ts. Exists because every
// stacked free-tier provider rate-limits at the API-key/org level, not per end
// user — this module is what rations that shared pool fairly across our own
// users, and what meters real spend against purchased credits on the paid tier.
//
// Plans vs tiers: a user's *plan* is free | trial | pro (UserPlan.plan, with
// trial expiry checked lazily here — no cron). The *tier* passed down to
// lib/llm.ts is just the routing pool: trial and pro both route "paid".
import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma as defaultPrisma } from "@/lib/prisma";
import * as llm from "@/lib/llm";
import {
  CREDIT_COSTS,
  FREE_MONTHLY_QUOTA,
  PRO_ONLY_TASKS,
  TRIAL_CREDITS,
  TRIAL_DAYS,
  freeTierPaidSpendCapUsd,
  llmForceFreePool,
  type LlmTask,
} from "@/lib/pricing";

const LLM_BACKEND = process.env.LLM_BACKEND ?? "ollama";

export { FREE_MONTHLY_QUOTA, CREDIT_COSTS };
export type { LlmTask };

export type Tier = "free" | "paid";
export type Plan = "free" | "trial" | "pro";

export class QuotaExceededError extends Error {}
export class InsufficientCreditsError extends Error {}
export class ProFeatureError extends Error {}

function currentPeriodStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

// --- Plan resolution & reverse trial (E1) ---

/**
 * Loads the user's plan row, creating it on first sight: every new user starts
 * a 7-day reverse trial with a one-time credit grant. Creation is a single
 * transaction guarded by the UserPlan primary key, so a concurrent first hit
 * either wins the whole grant or is a clean no-op that re-reads the winner's row.
 */
export async function ensureUserPlan(userId: string, db: PrismaClient = defaultPrisma) {
  const existing = await db.userPlan.findUnique({ where: { userId } });
  if (existing) return existing;

  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  try {
    const [created] = await db.$transaction([
      db.userPlan.create({ data: { userId, plan: "trial", trialEndsAt } }),
      db.creditLedger.create({ data: { userId, deltaCredits: TRIAL_CREDITS, reason: "trial_grant" } }),
      db.userCredits.upsert({
        where: { userId },
        create: { userId, balance: TRIAL_CREDITS },
        update: { balance: { increment: TRIAL_CREDITS } },
      }),
    ]);
    return created;
  } catch {
    // Lost the creation race — the other request granted the trial.
    const plan = await db.userPlan.findUnique({ where: { userId } });
    if (!plan) throw new Error(`Failed to create or load UserPlan for ${userId}`);
    return plan;
  }
}

/** Flips an expired trial to free and zeroes the remaining trial credits.
 * Guarded on plan still being "trial" so concurrent expiry runs once. */
async function expireTrial(userId: string, db: PrismaClient): Promise<void> {
  const { count } = await db.userPlan.updateMany({
    where: { userId, plan: "trial" },
    data: { plan: "free" },
  });
  if (count === 0) return;

  const credits = await db.userCredits.findUnique({ where: { userId } });
  const balance = credits?.balance ?? 0;
  if (balance > 0) {
    await db.$transaction([
      db.userCredits.updateMany({ where: { userId, balance }, data: { balance: 0 } }),
      db.creditLedger.create({ data: { userId, deltaCredits: -balance, reason: "trial_expiry" } }),
    ]);
  }
}

/** The user's effective plan right now, applying lazy trial expiry. */
export async function getUserPlan(userId: string, db: PrismaClient = defaultPrisma): Promise<Plan> {
  const plan = await ensureUserPlan(userId, db);
  if (plan.plan === "pro") return "pro";
  if (plan.plan === "trial") {
    if (plan.trialEndsAt && plan.trialEndsAt.getTime() > Date.now()) return "trial";
    await expireTrial(userId, db);
    return "free";
  }
  return "free";
}

export async function getUserTier(userId: string, db: PrismaClient = defaultPrisma): Promise<Tier> {
  const plan = await getUserPlan(userId, db);
  return plan === "free" ? "free" : "paid";
}

// --- Atomic reservation primitives ---

/** Atomically decrements balance iff balance >= cost. A single conditional UPDATE —
 * the standard Postgres/SQLite-safe pattern for balance decrements under concurrency,
 * avoiding the check-then-act race a separate SELECT+UPDATE would have. */
export async function reserveCreditAtomic(db: PrismaClient, userId: string, cost: number): Promise<boolean> {
  await db.userCredits.upsert({ where: { userId }, create: { userId, balance: 0 }, update: {} });
  const { count } = await db.userCredits.updateMany({
    where: { userId, balance: { gte: cost } },
    data: { balance: { decrement: cost } },
  });
  return count > 0;
}

/** Atomically increments count iff count < limit for the given period. Same
 * conditional-UPDATE pattern as reserveCreditAtomic. */
export async function incrementFreeQuotaAtomic(
  db: PrismaClient,
  userId: string,
  periodStart: Date,
  limit: number
): Promise<boolean> {
  const { count } = await db.freeQuotaCounter.updateMany({
    where: { userId, periodStart, count: { lt: limit } },
    data: { count: { increment: 1 } },
  });
  return count > 0;
}

async function ensureCurrentPeriod(db: PrismaClient, userId: string, periodStart: Date): Promise<void> {
  const existing = await db.freeQuotaCounter.upsert({
    where: { userId },
    create: { userId, periodStart, count: 0 },
    update: {},
  });
  if (existing.periodStart.getTime() !== periodStart.getTime()) {
    // Roll over into the new period, guarded on the stale periodStart so a concurrent
    // rollover from another request is a no-op here instead of double-resetting.
    await db.freeQuotaCounter.updateMany({
      where: { userId, periodStart: existing.periodStart },
      data: { periodStart, count: 0 },
    });
  }
}

// --- E3: free/trial paid-model budget cap ---

/**
 * Monthly paid-model spend attributable to non-pro (free + trial) users. Two
 * cheap queries at MVP scale; if this ever shows up in a profile, denormalize
 * plan onto LlmUsageEvent instead.
 */
export async function nonProPaidSpendThisMonthUsd(db: PrismaClient = defaultPrisma): Promise<number> {
  const proUsers = await db.userPlan.findMany({ where: { plan: "pro" }, select: { userId: true } });
  const aggregate = await db.llmUsageEvent.aggregate({
    _sum: { realCostUsd: true },
    where: {
      tier: "paid",
      createdAt: { gte: currentPeriodStart() },
      userId: { notIn: proUsers.map((user) => user.userId) },
    },
  });
  return aggregate._sum.realCostUsd ?? 0;
}

async function isFreeFallbackBudgetExceeded(db: PrismaClient): Promise<boolean> {
  const cap = freeTierPaidSpendCapUsd();
  if (cap === 0) return true;
  return (await nonProPaidSpendThisMonthUsd(db)) >= cap;
}

// --- The gate ---

export type GateResult =
  | { ok: true; tier: Tier; creditsCharged: number }
  | { ok: false; tier: Tier; reason: "quota_exceeded" | "insufficient_credits" | "pro_feature" };

/**
 * Gate a single LLM call for a user. When LLM_BACKEND is "ollama" (local dev —
 * no real cost incurred) this never blocks; it only resolves the tier so the
 * pipeline can be exercised end to end before any billing infra is live.
 *
 * Paid plans (trial + pro) spend per-task credits (lib/pricing.ts); the free
 * plan counts a monthly action quota, except pro-only tasks (course
 * generation) which are hard-blocked with reason "pro_feature".
 */
export async function reserveLlmCall(
  userId: string,
  task: LlmTask,
  db: PrismaClient = defaultPrisma
): Promise<GateResult> {
  const plan = await getUserPlan(userId, db);
  const tier: Tier = plan === "free" ? "free" : "paid";

  if (LLM_BACKEND !== "direct") {
    return { ok: true, tier, creditsCharged: 0 };
  }

  if (tier === "paid") {
    const cost = CREDIT_COSTS[task];
    const ok = await reserveCreditAtomic(db, userId, cost);
    if (!ok) return { ok: false, tier, reason: "insufficient_credits" };

    // Trial users are still charged their (granted) credits, but once the
    // monthly non-pro paid-model budget is spent, their calls route to the
    // free provider pool so runaway trials can't burn real money.
    const routeFree = llmForceFreePool() || (plan === "trial" && (await isFreeFallbackBudgetExceeded(db)));
    return { ok: true, tier: routeFree ? "free" : "paid", creditsCharged: cost };
  }

  if (PRO_ONLY_TASKS.has(task)) {
    return { ok: false, tier, reason: "pro_feature" };
  }

  const periodStart = currentPeriodStart();
  await ensureCurrentPeriod(db, userId, periodStart);
  const ok = await incrementFreeQuotaAtomic(db, userId, periodStart, FREE_MONTHLY_QUOTA);
  return ok ? { ok: true, tier, creditsCharged: 0 } : { ok: false, tier, reason: "quota_exceeded" };
}

/** Returns already-reserved credits after a failed call so users never pay for
 * output they didn't get. Ledger reason "refund" keeps the books auditable. */
export async function refundLlmCredits(
  userId: string,
  credits: number,
  db: PrismaClient = defaultPrisma
): Promise<void> {
  if (credits <= 0) return;
  await db.$transaction([
    db.userCredits.upsert({
      where: { userId },
      create: { userId, balance: credits },
      update: { balance: { increment: credits } },
    }),
    db.creditLedger.create({ data: { userId, deltaCredits: credits, reason: "refund" } }),
  ]);
}

export function throwForGate(gate: Extract<GateResult, { ok: false }>): never {
  if (gate.reason === "quota_exceeded") {
    throw new QuotaExceededError("Free plan AI quota exceeded for this period.");
  }
  if (gate.reason === "pro_feature") {
    throw new ProFeatureError("Course generation is a Pro feature.");
  }
  throw new InsufficientCreditsError("Not enough credits to run this AI action.");
}

/** Route handlers: `catch (error) { const res = llmGateErrorResponse(error); if (res) return res; throw error; }` */
export function llmGateErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof QuotaExceededError) {
    return NextResponse.json(
      { error: "Free plan AI quota exceeded for this period. Upgrade to Pro for more.", reason: "quota_exceeded" },
      { status: 429 }
    );
  }
  if (error instanceof InsufficientCreditsError) {
    return NextResponse.json(
      { error: "Not enough credits to run this AI action. Buy more credits to continue.", reason: "insufficient_credits" },
      { status: 429 }
    );
  }
  if (error instanceof ProFeatureError) {
    return NextResponse.json(
      { error: "AI course generation is a Pro feature. Start a free trial or upgrade to build courses.", reason: "pro_feature" },
      { status: 403 }
    );
  }
  return null;
}

async function recordLlmUsage(
  params: { userId: string; task: LlmTask; tier: Tier; creditsCharged: number; realCostUsd?: number },
  db: PrismaClient = defaultPrisma
): Promise<void> {
  await db.$transaction([
    db.llmUsageEvent.create({
      data: {
        userId: params.userId,
        task: params.task,
        tier: params.tier,
        // Real per-call served-model attribution requires lib/llm.ts to surface
        // which model actually answered — not plumbed through yet since every
        // consumer currently only reads the graded/chunked result, not metadata.
        servedModel: `${params.tier}-pool`,
        success: true,
        realCostUsd: params.realCostUsd,
        creditsCharged: params.creditsCharged,
      },
    }),
    ...(params.creditsCharged > 0
      ? [
          db.creditLedger.create({
            data: {
              userId: params.userId,
              deltaCredits: -params.creditsCharged,
              reason: "llm_spend",
              realCostUsd: params.realCostUsd,
            },
          }),
        ]
      : []),
  ]);
}

/**
 * Chat turns stream, so they can't use the call-and-record wrappers below:
 * the route must reserve BEFORE opening the SSE stream (so quota errors can
 * still be a clean 429) and record usage after the stream finishes. This pair
 * exposes that split; reservation semantics are identical to the wrappers.
 * Course generation uses the same split (reserve, generate, record-or-refund)
 * from lib/course.ts because a failed generation must refund its credits.
 */
export async function reserveChatTurn(userId: string, db: PrismaClient = defaultPrisma): Promise<GateResult> {
  return reserveLlmCall(userId, "chat", db);
}

export async function recordChatUsage(
  userId: string,
  gate: Extract<GateResult, { ok: true }>,
  db: PrismaClient = defaultPrisma
): Promise<void> {
  await recordLlmUsage({ userId, task: "chat", tier: gate.tier, creditsCharged: gate.creditsCharged }, db);
}

export async function recordCourseGenUsage(
  userId: string,
  task: Extract<LlmTask, "coursegen_syllabus" | "coursegen_module">,
  gate: Extract<GateResult, { ok: true }>,
  db: PrismaClient = defaultPrisma
): Promise<void> {
  await recordLlmUsage({ userId, task, tier: gate.tier, creditsCharged: gate.creditsCharged }, db);
}

// --- Gated wrappers around lib/llm.ts's exports. Route handlers should call
// these instead of lib/llm.ts directly so every AI action goes through quota/credit
// enforcement and usage recording. ---

export async function chunkDocumentGated(
  userId: string,
  text: string,
  db: PrismaClient = defaultPrisma
): Promise<llm.SemanticChunk[]> {
  const gate = await reserveLlmCall(userId, "chunking", db);
  if (!gate.ok) throwForGate(gate);
  const result = await llm.chunkDocument(text, gate.tier);
  await recordLlmUsage({ userId, task: "chunking", tier: gate.tier, creditsCharged: gate.creditsCharged }, db);
  return result;
}

export async function gradeSummaryGated(
  userId: string,
  original: string,
  summary: string,
  db: PrismaClient = defaultPrisma
): Promise<llm.GradingResult> {
  const gate = await reserveLlmCall(userId, "grading", db);
  if (!gate.ok) throwForGate(gate);
  const result = await llm.gradeSummary(original, summary, gate.tier);
  await recordLlmUsage({ userId, task: "grading", tier: gate.tier, creditsCharged: gate.creditsCharged }, db);
  return result;
}

export async function gradeWordRecallGated(
  userId: string,
  word: string,
  actualDefinition: string,
  userDefinition: string,
  db: PrismaClient = defaultPrisma
): Promise<llm.RecallGradingResult> {
  const gate = await reserveLlmCall(userId, "grading", db);
  if (!gate.ok) throwForGate(gate);
  const result = await llm.gradeWordRecall(word, actualDefinition, userDefinition, gate.tier);
  await recordLlmUsage({ userId, task: "grading", tier: gate.tier, creditsCharged: gate.creditsCharged }, db);
  return result;
}

export async function generateQuizQuestionGated(
  userId: string,
  content: string,
  db: PrismaClient = defaultPrisma
): Promise<llm.QuizQuestionResult> {
  const gate = await reserveLlmCall(userId, "quizgen", db);
  if (!gate.ok) throwForGate(gate);
  const result = await llm.generateQuizQuestion(content, gate.tier);
  await recordLlmUsage({ userId, task: "quizgen", tier: gate.tier, creditsCharged: gate.creditsCharged }, db);
  return result;
}
