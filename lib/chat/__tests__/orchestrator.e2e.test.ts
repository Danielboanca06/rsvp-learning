// End-to-end test of a full assistant turn: real Postgres (isolated schema,
// same pattern as the other DB tests) + the local Ollama backend for actual
// token streaming. Skipped automatically when Ollama isn't running, like the
// DB tests skip without DATABASE_URL.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { setupTestDb } from "@/lib/__tests__/test-db";
import type { ChatStreamEvent } from "@/lib/chat/protocol";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";

const ollamaUp = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(2000) })
  .then((response) => response.ok)
  .catch(() => false);

describe.skipIf(!ollamaUp)("runAssistantTurn (e2e: isolated Postgres schema + local Ollama)", () => {
  let db: PrismaClient;
  let teardown: () => Promise<void>;

  beforeAll(async () => {
    ({ db, teardown } = await setupTestDb());
  }, 60_000);

  afterAll(async () => {
    await teardown?.();
  }, 30_000);

  it(
    "streams lifecycle events, runs the context tool, and persists the assistant message",
    { timeout: 180_000 },
    async () => {
      // Force the free local backend regardless of what .env configures, and
      // import the orchestrator only afterwards (LLM_BACKEND is read at module load).
      process.env.LLM_BACKEND = "ollama";
      const { runAssistantTurn } = await import("@/lib/chat/orchestrator");

      const userId = "user_e2e_chat";
      const space = await db.space.create({ data: { userId, name: "E2E", isDefault: true } });
      const document = await db.document.create({
        data: { userId, title: "The Water Cycle", spaceId: space.id },
      });
      const chunk = await db.chunk.create({
        data: {
          documentId: document.id,
          order: 0,
          title: "Evaporation",
          content:
            "Evaporation is the process by which water changes from a liquid to a gas. " +
            "The sun's energy heats water in oceans and lakes, giving molecules enough energy to escape into the air.",
          wordCount: 33,
        },
      });
      const thread = await db.chatThread.create({
        data: {
          userId,
          kind: "selection",
          title: "Evaporation is the process...",
          documentId: document.id,
          chunkId: chunk.id,
          selectionText: "water changes from a liquid to a gas",
        },
      });
      await db.chatMessage.create({
        data: {
          threadId: thread.id,
          role: "user",
          parts: [{ type: "text", text: "Help me understand what this passage means." }],
        },
      });

      const events: ChatStreamEvent[] = [];
      await runAssistantTurn({
        threadId: thread.id,
        userId,
        tier: "free",
        emit: (event) => events.push(event),
        db,
      });

      const types = events.map((event) => event.type);
      expect(types[0]).toBe("message.start");
      expect(types).toContain("tool.start");
      expect(types).toContain("tool.end");
      expect(types).toContain("part.start");
      expect(types.filter((type) => type === "text.delta").length).toBeGreaterThan(0);
      expect(types).toContain("message.end");
      expect(types).not.toContain("error");

      const toolEnd = events.find(
        (event): event is Extract<ChatStreamEvent, { type: "tool.end" }> => event.type === "tool.end"
      );
      expect(toolEnd?.status).toBe("completed");

      const persisted = await db.chatMessage.findMany({
        where: { threadId: thread.id, role: "assistant" },
      });
      expect(persisted).toHaveLength(1);
      expect(persisted[0].status).toBe("complete");
      const parts = persisted[0].parts as Array<{ type: string; text?: string; status?: string }>;
      expect(parts.some((part) => part.type === "tool_activity" && part.status === "completed")).toBe(true);
      const text = parts.find((part) => part.type === "text");
      expect(text?.text?.trim().length).toBeGreaterThan(0);
    }
  );
});
