// Server-side turn runner for the chat platform: the layer between the API
// route (which owns HTTP/SSE plumbing and quota gating) and the model/tool
// layers. Given a thread whose latest message is from the user, it emits the
// typed lifecycle events of one assistant turn, runs applicable tools, streams
// model text, and persists the finished assistant message. It builds the
// persisted parts array with the same applyEventToParts reducer the client
// uses, so what lands in the DB is exactly what a client following the stream
// rendered.

import { randomUUID } from "crypto";
import { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";
import { streamChatCompletion, type ChatCompletionMessage } from "@/lib/llm-chat";
import type { Tier } from "@/lib/llm";
import { applyEventToParts, type ChatStreamEvent, type MessagePart, type TextPart } from "@/lib/chat/protocol";
import {
  buildModuleTutorPrompt,
  buildPracticeSystemPrompt,
  buildSelectionSystemPrompt,
} from "@/lib/chat/prompts";
import { chatTools, type ToolContext } from "@/lib/chat/tools";
import type { LearnerBrief } from "@/lib/validation";

/** System prompt for a module-tutor thread, assembled from the course the
 * thread's document was generated for. Falls back to the selection prompt
 * shape if the course context is gone (module deleted from a draft, etc.). */
async function buildModuleSystemPrompt(
  db: PrismaClient,
  userId: string,
  documentId: string | null
): Promise<string> {
  const courseModule = documentId
    ? await db.courseModule.findFirst({
        where: { documentId, course: { userId } },
        include: { course: { include: { modules: { orderBy: { order: "asc" } } } } },
      })
    : null;

  if (!courseModule) {
    return buildSelectionSystemPrompt("(the module this conversation was anchored to)");
  }

  const brief = courseModule.course.learnerBrief as LearnerBrief | null;
  const briefLines = brief
    ? [
        `Self-assessed level: ${brief.level}`,
        `Time budget: about ${brief.timeBudgetMinutesPerDay} minutes per day`,
        `Motivation (learner's words): """${brief.motivation}"""`,
        ...(brief.interests ? [`Interests (learner's words): """${brief.interests}"""`] : []),
      ].join("\n")
    : "(no intake answers on file)";

  return buildModuleTutorPrompt({
    courseTitle: courseModule.course.title,
    courseGoal: courseModule.course.goal,
    moduleTitle: courseModule.title,
    objectives: (courseModule.objectives as string[]) ?? [],
    learnerBrief: briefLines,
    syllabusOutline: courseModule.course.modules
      .map((entry) => `${entry.order + 1}. ${entry.title} — ${entry.summary}`)
      .join("\n"),
    learnerProfile: null,
  });
}

export type EmitEvent = (event: ChatStreamEvent) => void;

function textOfParts(parts: MessagePart[]): string {
  return parts
    .filter((part): part is TextPart => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export async function runAssistantTurn(options: {
  threadId: string;
  userId: string;
  tier: Tier;
  emit: EmitEvent;
  db?: PrismaClient;
}): Promise<void> {
  const { threadId, userId, tier, emit } = options;
  const db = options.db ?? defaultPrisma;

  const thread = await db.chatThread.findFirst({
    where: { id: threadId, userId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!thread) throw new Error("Thread not found");

  const messageId = randomUUID();
  emit({ type: "message.start", messageId, threadId });
  emit({ type: "status", state: "thinking", label: "Thinking about your question" });

  // Reducer-built parts: every emitted event is also applied locally so the
  // persisted message matches what the stream produced.
  let parts: MessagePart[] = [];
  const apply = (event: ChatStreamEvent) => {
    parts = applyEventToParts(parts, event);
    emit(event);
  };

  try {
    // --- Tool phase ---
    const toolContext: ToolContext = {
      userId,
      documentId: thread.documentId,
      chunkId: thread.chunkId,
      selectionText: thread.selectionText,
      db,
    };

    const toolOutputs: string[] = [];
    for (const tool of chatTools) {
      if (!tool.isApplicable(toolContext)) continue;

      const toolCallId = randomUUID();
      emit({ type: "status", state: "calling_tool", label: tool.label, toolName: tool.name });
      apply({ type: "tool.start", toolCallId, toolName: tool.name, label: tool.label });

      try {
        emit({ type: "status", state: "waiting_tool", label: tool.label, toolName: tool.name });
        const result = await tool.run(toolContext);
        toolOutputs.push(result.content);
        apply({ type: "tool.end", toolCallId, status: "completed", summary: result.summary });
      } catch {
        // A failed context tool degrades the answer but shouldn't kill the
        // turn — the model still has the selection text itself.
        apply({ type: "tool.end", toolCallId, status: "failed", summary: "Context unavailable" });
      }
    }

    // --- Prompt assembly ---
    const selectionText = thread.selectionText ?? "";
    const systemPrompt =
      thread.kind === "module"
        ? await buildModuleSystemPrompt(db, userId, thread.documentId)
        : thread.kind === "practice"
          ? buildPracticeSystemPrompt(selectionText)
          : buildSelectionSystemPrompt(selectionText);

    const llmMessages: ChatCompletionMessage[] = [
      { role: "system", content: systemPrompt },
      ...(toolOutputs.length > 0
        ? [
            {
              role: "system" as const,
              content: `Context gathered from the reader's document:\n\n${toolOutputs.join("\n\n---\n\n")}`,
            },
          ]
        : []),
      ...thread.messages
        .map((message): ChatCompletionMessage | null => {
          const content = textOfParts(message.parts as MessagePart[]);
          if (!content.trim()) return null;
          return { role: message.role === "assistant" ? "assistant" : "user", content };
        })
        .filter((message): message is ChatCompletionMessage => message !== null),
    ];

    // --- Generation phase ---
    emit({ type: "status", state: "generating", label: "Writing a reply" });
    const textPartIndex = parts.length;
    apply({ type: "part.start", partIndex: textPartIndex, part: { type: "text", text: "" } });

    for await (const delta of streamChatCompletion(llmMessages, tier)) {
      apply({ type: "text.delta", partIndex: textPartIndex, delta });
    }

    if (!textOfParts(parts).trim()) {
      throw new Error("The model produced an empty reply");
    }

    // --- Persistence ---
    const [message] = await db.$transaction([
      db.chatMessage.create({
        data: { id: messageId, threadId, role: "assistant", parts: parts as object[], status: "complete" },
      }),
      db.chatThread.update({ where: { id: threadId }, data: { updatedAt: new Date() } }),
    ]);

    emit({
      type: "message.end",
      message: {
        id: message.id,
        threadId,
        role: "assistant",
        parts,
        status: "complete",
        createdAt: message.createdAt.toISOString(),
      },
    });
    emit({ type: "status", state: "completed", label: "Done" });
  } catch (error) {
    console.error("Chat turn failed:", error);
    emit({ type: "status", state: "failed", label: "Something went wrong" });
    emit({
      type: "error",
      code: "turn_failed",
      message: "The AI could not finish its reply. Please try again.",
    });
    // Persist whatever partial content exists so the thread history is honest
    // about the failed turn; an all-empty failure leaves no row behind.
    if (parts.length > 0) {
      await db.chatMessage
        .create({ data: { id: messageId, threadId, role: "assistant", parts: parts as object[], status: "failed" } })
        .catch(() => {});
    }
  }
}
