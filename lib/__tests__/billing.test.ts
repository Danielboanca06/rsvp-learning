import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { grantCredits } from "@/lib/billing";
import { setupTestDb } from "./test-db";

let db: PrismaClient;
let teardown: () => Promise<void>;

beforeAll(async () => {
  ({ db, teardown } = await setupTestDb());
}, 30000);

afterAll(async () => {
  await teardown();
});

describe("grantCredits", () => {
  it("grants the requested credit amount to a new user", async () => {
    const userId = "user_grant_new";
    await grantCredits(userId, 50, "stripe_topup", "evt_1", db);

    const credits = await db.userCredits.findUniqueOrThrow({ where: { userId } });
    expect(credits.balance).toBe(50);
  });

  it("is idempotent under a replayed Stripe webhook event (same stripeEventId)", async () => {
    const userId = "user_grant_idempotent";
    await grantCredits(userId, 50, "stripe_topup", "evt_replayed", db);
    await grantCredits(userId, 50, "stripe_topup", "evt_replayed", db); // Stripe retry

    const credits = await db.userCredits.findUniqueOrThrow({ where: { userId } });
    expect(credits.balance).toBe(50); // not 100 — the replay must be a no-op

    const ledgerRows = await db.creditLedger.findMany({ where: { userId } });
    expect(ledgerRows).toHaveLength(1);
  });

  it("accumulates balance across distinct grant events", async () => {
    const userId = "user_grant_accumulate";
    await grantCredits(userId, 50, "stripe_topup", "evt_a", db);
    await grantCredits(userId, 200, "stripe_subscription_grant", "evt_b", db);

    const credits = await db.userCredits.findUniqueOrThrow({ where: { userId } });
    expect(credits.balance).toBe(250);
  });
});
