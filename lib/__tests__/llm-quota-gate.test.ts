// Regression test for the LLM_BACKEND naming bug: reserveLlmCall used to check
// against the old "litellm" backend name and never gated anything once the
// backend was renamed to "direct" — quota/credits silently never decremented.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
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
});

afterEach(() => {
  delete process.env.LLM_BACKEND;
});

describe("reserveLlmCall gating", () => {
  it("actually enforces the free quota when LLM_BACKEND=direct", async () => {
    process.env.LLM_BACKEND = "direct";
    const { reserveLlmCall, FREE_MONTHLY_QUOTA } = await import("@/lib/llm-quota");
    const userId = "user_gate_free_regression";

    const results = await Promise.all(
      Array.from({ length: FREE_MONTHLY_QUOTA + 5 }, () => reserveLlmCall(userId, db))
    );

    const allowed = results.filter((r) => r.ok).length;
    const blocked = results.filter((r) => !r.ok);
    expect(allowed).toBe(FREE_MONTHLY_QUOTA);
    expect(blocked.length).toBe(5);
    expect(blocked.every((r) => !r.ok && r.reason === "quota_exceeded")).toBe(true);
  }, 20000);

  it("does not gate at all when LLM_BACKEND is not direct (e.g. ollama/local dev)", async () => {
    process.env.LLM_BACKEND = "ollama";
    const { reserveLlmCall, FREE_MONTHLY_QUOTA } = await import("@/lib/llm-quota");
    const userId = "user_gate_ollama_regression";

    const results = await Promise.all(
      Array.from({ length: FREE_MONTHLY_QUOTA + 5 }, () => reserveLlmCall(userId, db))
    );

    expect(results.every((r) => r.ok)).toBe(true);
  });
});
