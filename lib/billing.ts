import { PrismaClient, Prisma } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";
import { FREE_MONTHLY_QUOTA, getUserTier } from "@/lib/llm-quota";

export type BillingStatus = {
  plan: "free" | "pro";
  creditBalance: number;
  freeQuotaUsed: number;
  freeQuotaLimit: number;
};

function currentPeriodStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function getBillingStatus(userId: string, db: PrismaClient = defaultPrisma): Promise<BillingStatus> {
  const tier = await getUserTier(userId, db);
  const plan = tier === "paid" ? "pro" : "free";

  const [credits, quota] = await Promise.all([
    db.userCredits.findUnique({ where: { userId } }),
    db.freeQuotaCounter.findUnique({ where: { userId } }),
  ]);

  const periodStart = currentPeriodStart();
  const quotaIsCurrentPeriod = quota?.periodStart.getTime() === periodStart.getTime();

  return {
    plan,
    creditBalance: credits?.balance ?? 0,
    freeQuotaUsed: quotaIsCurrentPeriod ? quota!.count : 0,
    freeQuotaLimit: FREE_MONTHLY_QUOTA,
  };
}

// Idempotent: relies on CreditLedger.stripeEventId being unique, so a Stripe
// webhook retry (Stripe retries aggressively on non-2xx) is always a safe
// no-op here rather than double-granting credits.
export async function grantCredits(
  userId: string,
  amount: number,
  reason: string,
  stripeEventId: string,
  db: PrismaClient = defaultPrisma
): Promise<void> {
  try {
    await db.$transaction([
      db.creditLedger.create({ data: { userId, deltaCredits: amount, reason, stripeEventId } }),
      db.userCredits.upsert({
        where: { userId },
        create: { userId, balance: amount },
        update: { balance: { increment: amount } },
      }),
    ]);
  } catch (error) {
    const isDuplicateEvent = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    if (!isDuplicateEvent) throw error;
  }
}
