// Per-task credit costs, the pro_feature hard block, the reverse trial's lazy
// creation/expiry, and refund-on-failure — the whole money path around
// reserveLlmCall.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { CREDIT_COSTS, TRIAL_CREDITS } from "@/lib/pricing";
import { setupTestDb } from "./test-db";

let db: PrismaClient;
let teardown: () => Promise<void>;

beforeAll(async () => {
  ({ db, teardown } = await setupTestDb());
}, 30000);

afterAll(async () => {
  await teardown();
});

beforeEach(() => {
  vi.resetModules();
  process.env.LLM_BACKEND = "direct";
});

afterEach(() => {
  delete process.env.LLM_BACKEND;
});

async function quota() {
  return import("@/lib/llm-quota");
}

describe("reverse trial (E1)", () => {
  it("creates a 7-day trial with the credit grant on first sight of a user", async () => {
    const { getUserPlan } = await quota();
    const userId = "user_trial_new";

    const plan = await getUserPlan(userId, db);

    expect(plan).toBe("trial");
    const credits = await db.userCredits.findUniqueOrThrow({ where: { userId } });
    expect(credits.balance).toBe(TRIAL_CREDITS);
    const grant = await db.creditLedger.findFirst({ where: { userId, reason: "trial_grant" } });
    expect(grant?.deltaCredits).toBe(TRIAL_CREDITS);
    const row = await db.userPlan.findUniqueOrThrow({ where: { userId } });
    expect(row.trialEndsAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it("does not double-grant under concurrent first hits", async () => {
    const { getUserPlan } = await quota();
    const userId = "user_trial_race";

    await Promise.all(Array.from({ length: 5 }, () => getUserPlan(userId, db)));

    const credits = await db.userCredits.findUniqueOrThrow({ where: { userId } });
    expect(credits.balance).toBe(TRIAL_CREDITS);
    const grants = await db.creditLedger.findMany({ where: { userId, reason: "trial_grant" } });
    expect(grants.length).toBe(1);
  });

  it("lazily expires a finished trial: plan free, remaining credits zeroed via ledger", async () => {
    const { getUserPlan } = await quota();
    const userId = "user_trial_expired";
    await db.userPlan.create({
      data: { userId, plan: "trial", trialEndsAt: new Date(Date.now() - 60_000) },
    });
    await db.userCredits.create({ data: { userId, balance: 42 } });

    const plan = await getUserPlan(userId, db);

    expect(plan).toBe("free");
    const credits = await db.userCredits.findUniqueOrThrow({ where: { userId } });
    expect(credits.balance).toBe(0);
    const expiry = await db.creditLedger.findFirst({ where: { userId, reason: "trial_expiry" } });
    expect(expiry?.deltaCredits).toBe(-42);
    const row = await db.userPlan.findUniqueOrThrow({ where: { userId } });
    expect(row.plan).toBe("free");
  });
});

describe("per-task credit costs (B6)", () => {
  it("charges each task its configured cost on the paid tier", async () => {
    const { reserveLlmCall } = await quota();
    const userId = "user_costs_pro";
    await db.userPlan.create({ data: { userId, plan: "pro" } });
    await db.userCredits.create({ data: { userId, balance: 100 } });

    const syllabusGate = await reserveLlmCall(userId, "coursegen_syllabus", db);
    expect(syllabusGate).toMatchObject({ ok: true, creditsCharged: CREDIT_COSTS.coursegen_syllabus });

    const moduleGate = await reserveLlmCall(userId, "coursegen_module", db);
    expect(moduleGate).toMatchObject({ ok: true, creditsCharged: CREDIT_COSTS.coursegen_module });

    const gradingGate = await reserveLlmCall(userId, "grading", db);
    expect(gradingGate).toMatchObject({ ok: true, creditsCharged: CREDIT_COSTS.grading });

    const credits = await db.userCredits.findUniqueOrThrow({ where: { userId } });
    expect(credits.balance).toBe(
      100 - CREDIT_COSTS.coursegen_syllabus - CREDIT_COSTS.coursegen_module - CREDIT_COSTS.grading
    );
  });

  it("rejects with insufficient_credits when the balance can't cover the task, leaving it untouched", async () => {
    const { reserveLlmCall } = await quota();
    const userId = "user_costs_broke";
    await db.userPlan.create({ data: { userId, plan: "pro" } });
    await db.userCredits.create({ data: { userId, balance: 4 } });

    const gate = await reserveLlmCall(userId, "chunking", db); // costs 5

    expect(gate).toMatchObject({ ok: false, reason: "insufficient_credits" });
    const credits = await db.userCredits.findUniqueOrThrow({ where: { userId } });
    expect(credits.balance).toBe(4);
  });
});

describe("pro_feature hard block (B6)", () => {
  it("blocks course generation for free users without consuming quota", async () => {
    const { reserveLlmCall, FREE_MONTHLY_QUOTA } = await quota();
    const userId = "user_pro_feature_block";
    await db.userPlan.create({ data: { userId, plan: "free" } });

    const syllabusGate = await reserveLlmCall(userId, "coursegen_syllabus", db);
    const moduleGate = await reserveLlmCall(userId, "coursegen_module", db);

    expect(syllabusGate).toMatchObject({ ok: false, reason: "pro_feature" });
    expect(moduleGate).toMatchObject({ ok: false, reason: "pro_feature" });

    // The block must not have burned any of the user's free quota.
    const gradingGate = await reserveLlmCall(userId, "grading", db);
    expect(gradingGate.ok).toBe(true);
    const counter = await db.freeQuotaCounter.findUniqueOrThrow({ where: { userId } });
    expect(counter.count).toBe(1);
    expect(FREE_MONTHLY_QUOTA).toBeGreaterThan(1);
  });
});

describe("refund on failure (B6)", () => {
  it("returns the reserved credits with a ledger refund row", async () => {
    const { reserveLlmCall, refundLlmCredits } = await quota();
    const userId = "user_refund";
    await db.userPlan.create({ data: { userId, plan: "pro" } });
    await db.userCredits.create({ data: { userId, balance: 20 } });

    const gate = await reserveLlmCall(userId, "coursegen_syllabus", db);
    expect(gate.ok).toBe(true);
    await refundLlmCredits(userId, gate.ok ? gate.creditsCharged : 0, db);

    const credits = await db.userCredits.findUniqueOrThrow({ where: { userId } });
    expect(credits.balance).toBe(20);
    const refund = await db.creditLedger.findFirst({ where: { userId, reason: "refund" } });
    expect(refund?.deltaCredits).toBe(CREDIT_COSTS.coursegen_syllabus);
  });
});
