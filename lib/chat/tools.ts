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

export const chatTools: ChatTool[] = [readDocumentContextTool];
