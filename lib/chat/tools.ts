// Tool runtime for the chat platform. Tools are first-class in the stream
// protocol: the orchestrator emits tool.start/tool.end around each run and the
// result is persisted as a tool_activity message part, so the UI can show what
// the assistant did while composing a reply. New tools register here; the
// orchestrator and protocol don't change.

import { PrismaClient } from "@prisma/client";

export type ToolContext = {
  userId: string;
  documentId: string | null;
  chunkId: string | null;
  selectionText: string | null;
  db: PrismaClient;
};

export type ToolResult = {
  /** Short human-readable outcome shown in the UI status block. */
  summary: string;
  /** Text injected into the model prompt. */
  content: string;
};

export type ChatTool = {
  name: string;
  /** Human-readable action label shown while the tool runs. */
  label: string;
  /** Whether the tool can run for this thread's context. */
  isApplicable(context: ToolContext): boolean;
  run(context: ToolContext): Promise<ToolResult>;
};

/** Loads the module the conversation is anchored to, plus just enough of the
 * surrounding document (title + neighboring module titles) for the model to
 * answer with document-level context, not only the highlighted sentence. */
export const readDocumentContextTool: ChatTool = {
  name: "read_document_context",
  label: "Reading the passage's module and surrounding document",
  isApplicable(context) {
    return Boolean(context.documentId && context.chunkId);
  },
  async run(context) {
    const chunk = await context.db.chunk.findFirst({
      where: { id: context.chunkId!, document: { id: context.documentId!, userId: context.userId } },
      include: {
        document: {
          select: {
            title: true,
            chunks: { select: { order: true, title: true }, orderBy: { order: "asc" } },
          },
        },
      },
    });

    if (!chunk) {
      throw new Error("The module this conversation is anchored to no longer exists.");
    }

    const outline = chunk.document.chunks
      .map((entry) => `${entry.order + 1}. ${entry.title}${entry.order === chunk.order ? " (current module)" : ""}`)
      .join("\n");

    return {
      summary: `Read "${chunk.title}" (${chunk.wordCount} words)`,
      content: [
        `Document: "${chunk.document.title}"`,
        `Document outline:\n${outline}`,
        `Current module ("${chunk.title}") full text:\n${chunk.content}`,
      ].join("\n\n"),
    };
  },
};

/** Loads the whole document a module-tutor thread is anchored to (no chunk
 * anchor, so readDocumentContextTool can't apply): outline plus full module
 * text, which is generated content sized to fit a prompt comfortably. */
export const readModuleContentTool: ChatTool = {
  name: "read_module_content",
  label: "Reading the module's content",
  isApplicable(context) {
    return Boolean(context.documentId && !context.chunkId);
  },
  async run(context) {
    const document = await context.db.document.findFirst({
      where: { id: context.documentId!, userId: context.userId },
      include: { chunks: { orderBy: { order: "asc" }, select: { order: true, title: true, content: true } } },
    });
    if (!document) {
      throw new Error("The module this conversation is anchored to no longer exists.");
    }

    const sections = document.chunks
      .map((chunk) => `Section ${chunk.order + 1}: ${chunk.title}\n${chunk.content}`)
      .join("\n\n");

    return {
      summary: `Read "${document.title}" (${document.chunks.length} sections)`,
      content: `Module "${document.title}" full text:\n\n${sections}`,
    };
  },
};

/** Compact summary of the learner's measured performance on the thread's
 * document — recall attempt scores, sections not yet passed, quiz misses — so
 * the tutor grounds difficulty adaptively instead of guessing. Pure DB read. */
export const readLearnerPerformanceTool: ChatTool = {
  name: "read_learner_performance",
  label: "Checking how you've done on this module",
  isApplicable(context) {
    return Boolean(context.documentId);
  },
  async run(context) {
    const chunks = await context.db.chunk.findMany({
      where: { document: { id: context.documentId!, userId: context.userId } },
      orderBy: { order: "asc" },
      select: {
        id: true,
        title: true,
        quizWrongCount: true,
        attempts: { orderBy: { createdAt: "desc" }, take: 5, select: { score: true, passed: true } },
      },
    });
    if (chunks.length === 0) {
      throw new Error("This document has no sections to report on.");
    }

    const attempted = chunks.filter((chunk) => chunk.attempts.length > 0);
    if (attempted.length === 0) {
      return {
        summary: "No attempts yet",
        content: "Learner performance: the learner has not attempted any recall summaries on this module yet.",
      };
    }

    const allScores = attempted.flatMap((chunk) => chunk.attempts.map((attempt) => attempt.score));
    const averageScore = Math.round(allScores.reduce((sum, score) => sum + score, 0) / allScores.length);
    const passedCount = chunks.filter((chunk) => chunk.attempts.some((attempt) => attempt.passed)).length;

    const struggling = attempted
      .filter((chunk) => !chunk.attempts.some((attempt) => attempt.passed) || chunk.quizWrongCount > 0)
      .slice(0, 4)
      .map((chunk) => {
        const best = Math.max(...chunk.attempts.map((attempt) => attempt.score));
        const flags = [
          `best recall score ${best}`,
          ...(chunk.quizWrongCount > 0 ? [`${chunk.quizWrongCount} quiz miss(es)`] : []),
        ];
        return `- "${chunk.title}": ${flags.join(", ")}`;
      });

    return {
      summary: `Avg recall ${averageScore}/100 · ${passedCount}/${chunks.length} sections passed`,
      content: [
        `Learner performance on this document:`,
        `- ${passedCount} of ${chunks.length} sections passed; average recall score ${averageScore}/100 over ${allScores.length} recent attempts.`,
        ...(struggling.length > 0 ? [`Sections the learner is struggling with:`, ...struggling] : []),
      ].join("\n"),
    };
  },
};

export const chatTools: ChatTool[] = [readDocumentContextTool, readModuleContentTool, readLearnerPerformanceTool];
