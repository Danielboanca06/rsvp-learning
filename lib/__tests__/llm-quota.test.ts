import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { incrementFreeQuotaAtomic, reserveCreditAtomic } from "@/lib/llm-quota";
import { setupTestDb } from "./test-db";

let db: PrismaClient;
let teardown: () => Promise<void>;

beforeAll(async () => {
  ({ db, teardown } = await setupTestDb());
}, 30000);

afterAll(async () => {
  await teardown();
});

describe("reserveCreditAtomic", () => {
  it("allows exactly as many concurrent reservations as the balance covers", async () => {
    const userId = "user_credit_race";
    await db.userCredits.create({ data: { userId, balance: 3 } });

    const results = await Promise.all(Array.from({ length: 10 }, () => reserveCreditAtomic(db, userId, 1)));

    expect(results.filter(Boolean).length).toBe(3);
    const final = await db.userCredits.findUniqueOrThrow({ where: { userId } });
    expect(final.balance).toBe(0);
  });

  it("rejects a reservation when the balance is below the requested cost", async () => {
    const userId = "user_credit_insufficient";
    await db.userCredits.create({ data: { userId, balance: 1 } });

    const ok = await reserveCreditAtomic(db, userId, 5);

    expect(ok).toBe(false);
    const final = await db.userCredits.findUniqueOrThrow({ where: { userId } });
    expect(final.balance).toBe(1); // untouched — no partial debit on rejection
  });

  it("creates a zero-balance row on first use so a brand-new user is correctly rejected, not errored", async () => {
    const userId = "user_credit_new";

    const ok = await reserveCreditAtomic(db, userId, 1);

    expect(ok).toBe(false);
    const final = await db.userCredits.findUniqueOrThrow({ where: { userId } });
    expect(final.balance).toBe(0);
  });
});

describe("incrementFreeQuotaAtomic", () => {
  it("allows exactly up to the limit within a period and rejects beyond it", async () => {
    const userId = "user_quota_race";
    const periodStart = new Date("2026-07-01T00:00:00.000Z");
    await db.freeQuotaCounter.create({ data: { userId, periodStart, count: 0 } });

    const results = await Promise.all(
      Array.from({ length: 10 }, () => incrementFreeQuotaAtomic(db, userId, periodStart, 3))
    );

    expect(results.filter(Boolean).length).toBe(3);
    const final = await db.freeQuotaCounter.findUniqueOrThrow({ where: { userId } });
    expect(final.count).toBe(3);
  });

  it("does not increment when the periodStart argument doesn't match the stored row", async () => {
    const userId = "user_quota_wrong_period";
    await db.freeQuotaCounter.create({
      data: { userId, periodStart: new Date("2026-06-01T00:00:00.000Z"), count: 0 },
    });

    const ok = await incrementFreeQuotaAtomic(db, userId, new Date("2026-07-01T00:00:00.000Z"), 30);

    expect(ok).toBe(false);
  });
});
