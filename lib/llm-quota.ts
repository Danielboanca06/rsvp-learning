// Per-user quota/credit gating in front of lib/llm.ts. Exists because every
// stacked free-tier provider rate-limits at the API-key/org level, not per end
// user — this module is what rations that shared pool fairly across our own
// users, and what meters real spend against purchased credits on the paid tier.
import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma as defaultPrisma } from "@/lib/prisma";
import * as llm from "@/lib/llm";

const LLM_BACKEND = process.env.LLM_BACKEND ?? "ollama";

export const FREE_MONTHLY_QUOTA = 30; // AI actions/month on the free plan
export const CREDIT_COST_PER_CALL = 1; // credits deducted per paid-tier LLM call

export type Tier = "free" | "paid";
export type LlmTask = "chunking" | "grading" | "quizgen";

export class QuotaExceededError extends Error {}
export class InsufficientCreditsError extends Error {}

function currentPeriodStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function getUserTier(userId: string, db: PrismaClient = defaultPrisma): Promise<Tier> {
  const plan = await db.userPlan.findUnique({ where: { userId } });
  return plan?.plan === "pro" ? "paid" : "free";
}

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

export type GateResult =
  | { ok: true; tier: Tier }
  | { ok: false; tier: Tier; reason: "quota_exceeded" | "insufficient_credits" };

/**
 * Gate a single LLM call for a user. When LLM_BACKEND is "ollama" (local dev —
 * no real cost incurred) this never blocks; it only resolves the tier so the
 * pipeline can be exercised end to end before any billing infra is live.
 */
export async function reserveLlmCall(userId: string, db: PrismaClient = defaultPrisma): Promise<GateResult> {
  const tier = await getUserTier(userId, db);

  if (LLM_BACKEND !== "direct") {
    return { ok: true, tier };
  }

  if (tier === "paid") {
    const ok = await reserveCreditAtomic(db, userId, CREDIT_COST_PER_CALL);
    return ok ? { ok: true, tier } : { ok: false, tier, reason: "insufficient_credits" };
  }

  const periodStart = currentPeriodStart();
  await ensureCurrentPeriod(db, userId, periodStart);
  const ok = await incrementFreeQuotaAtomic(db, userId, periodStart, FREE_MONTHLY_QUOTA);
  return ok ? { ok: true, tier } : { ok: false, tier, reason: "quota_exceeded" };
}

function throwForGate(gate: Extract<GateResult, { ok: false }>): never {
  if (gate.reason === "quota_exceeded") {
    throw new QuotaExceededError("Free plan AI quota exceeded for this period.");
  }
  throw new InsufficientCreditsError("Not enough credits to run this AI action.");
}

/** Route handlers: `catch (error) { const res = llmGateErrorResponse(error); if (res) return res; throw error; }` */
export function llmGateErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof QuotaExceededError) {
    return NextResponse.json(
      { error: "Free plan AI quota exceeded for this period. Upgrade to Pro for more." },
      { status: 429 }
    );
  }
  if (error instanceof InsufficientCreditsError) {
    return NextResponse.json(
      { error: "Not enough credits to run this AI action. Buy more credits to continue." },
      { status: 429 }
    );
  }
  return null;
}

async function recordLlmUsage(
  params: { userId: string; task: LlmTask; tier: Tier; realCostUsd?: number },
  db: PrismaClient = defaultPrisma
): Promise<void> {
  await db.$transaction([
    db.llmUsageEvent.create({
      data: {
        userId: params.userId,
        task: params.task,
        tier: params.tier,
        // Real per-call served-model attribution requires lib/llm.ts to surface
        // which model actually answered (LiteLLM returns this) — not plumbed
        // through yet since every consumer currently only reads the graded/chunked
        // result, not metadata. Follow-up: thread it through once the Phase 3
        // grading-agreement harness needs per-model breakdowns.
        servedModel: `${params.tier}-pool`,
        success: true,
        realCostUsd: params.realCostUsd,
      },
    }),
    ...(params.tier === "paid" && params.realCostUsd !== undefined
      ? [
          db.creditLedger.create({
            data: {
              userId: params.userId,
              deltaCredits: -CREDIT_COST_PER_CALL,
              reason: "llm_spend",
              realCostUsd: params.realCostUsd,
            },
          }),
        ]
      : []),
  ]);
}

// --- Gated wrappers around lib/llm.ts's four exports. Route handlers should call
// these instead of lib/llm.ts directly so every AI action goes through quota/credit
// enforcement and usage recording. ---

export async function chunkDocumentGated(
  userId: string,
  text: string,
  db: PrismaClient = defaultPrisma
): Promise<llm.SemanticChunk[]> {
  const gate = await reserveLlmCall(userId, db);
  if (!gate.ok) throwForGate(gate);
  const result = await llm.chunkDocument(text, gate.tier);
  await recordLlmUsage({ userId, task: "chunking", tier: gate.tier }, db);
  return result;
}

export async function gradeSummaryGated(
  userId: string,
  original: string,
  summary: string,
  db: PrismaClient = defaultPrisma
): Promise<llm.GradingResult> {
  const gate = await reserveLlmCall(userId, db);
  if (!gate.ok) throwForGate(gate);
  const result = await llm.gradeSummary(original, summary, gate.tier);
  await recordLlmUsage({ userId, task: "grading", tier: gate.tier }, db);
  return result;
}

export async function gradeWordRecallGated(
  userId: string,
  word: string,
  actualDefinition: string,
  userDefinition: string,
  db: PrismaClient = defaultPrisma
): Promise<llm.RecallGradingResult> {
  const gate = await reserveLlmCall(userId, db);
  if (!gate.ok) throwForGate(gate);
  const result = await llm.gradeWordRecall(word, actualDefinition, userDefinition, gate.tier);
  await recordLlmUsage({ userId, task: "grading", tier: gate.tier }, db);
  return result;
}

export async function generateQuizQuestionGated(
  userId: string,
  content: string,
  db: PrismaClient = defaultPrisma
): Promise<llm.QuizQuestionResult> {
  const gate = await reserveLlmCall(userId, db);
  if (!gate.ok) throwForGate(gate);
  const result = await llm.generateQuizQuestion(content, gate.tier);
  await recordLlmUsage({ userId, task: "quizgen", tier: gate.tier }, db);
  return result;
}
