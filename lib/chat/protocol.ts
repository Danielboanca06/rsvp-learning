// Wire protocol for the app-wide AI chat platform. Shared by the server-side
// orchestrator (lib/chat/orchestrator.ts), the API routes, and the client hook
// (lib/hooks/useChatThread.ts), so both sides speak the same discriminated
// unions. Design constraints:
// - Streaming-first: every assistant turn is a stream of typed lifecycle
//   events over SSE, not a single response payload.
// - Forward-compatible: clients must tolerate event and message-part types
//   they don't know about (skip, never throw), so the schema can grow —
//   diagrams, charts, citations, cards — without breaking deployed clients.
// - Tool calls are first-class: they have their own lifecycle events and a
//   persisted message-part representation, mirroring how modern streaming
//   response APIs expose lifecycle/output/tool events.

export type ChatRole = "user" | "assistant";

export type ChatThreadKind = "selection" | "practice";

// --- Message parts ---
// A message is an ordered array of typed parts. Only "text" and
// "tool_activity" exist today; renderers and reducers must ignore unknown
// types rather than fail.

export type TextPart = {
  type: "text";
  text: string;
};

export type ToolActivityPart = {
  type: "tool_activity";
  toolCallId: string;
  toolName: string;
  /** Human-readable description of what the tool did, e.g. "Read module context". */
  label: string;
  status: "running" | "completed" | "failed";
  /** Short human-readable result summary, e.g. "Read 240 words of module 3". */
  summary?: string;
};

export type KnownMessagePart = TextPart | ToolActivityPart;

/** Forward-compatible part: future types flow through storage and the wire
 * without breaking old clients. */
export type MessagePart = KnownMessagePart | { type: string; [key: string]: unknown };

export type ChatMessageDto = {
  id: string;
  threadId: string;
  role: ChatRole;
  parts: MessagePart[];
  status: "complete" | "failed";
  createdAt: string;
};

export type ChatThreadDto = {
  id: string;
  kind: ChatThreadKind | string;
  title: string;
  documentId: string | null;
  chunkId: string | null;
  selectionText: string | null;
  parentThreadId: string | null;
  createdAt: string;
  updatedAt: string;
};

// --- Stream events ---

/** Backend execution states surfaced to the UI as status blocks. */
export type AssistantRunState =
  | "thinking"
  | "reading_context"
  | "calling_tool"
  | "waiting_tool"
  | "generating"
  | "completed"
  | "failed";

export type ChatStreamEvent =
  | { type: "message.start"; messageId: string; threadId: string }
  | { type: "status"; state: AssistantRunState; label: string; toolName?: string }
  | { type: "tool.start"; toolCallId: string; toolName: string; label: string }
  | { type: "tool.end"; toolCallId: string; status: "completed" | "failed"; summary?: string }
  | { type: "part.start"; partIndex: number; part: MessagePart }
  | { type: "text.delta"; partIndex: number; delta: string }
  | { type: "message.end"; message: ChatMessageDto }
  | { type: "error"; message: string; code?: string };

/** What the client parser actually yields: known events keep their narrow
 * types; unrecognized-but-well-formed events surface as { type: string } so
 * consumers can explicitly ignore them. */
export type IncomingChatStreamEvent = ChatStreamEvent | { type: string; [key: string]: unknown };

// --- SSE encoding/decoding ---
// Events travel as one SSE `data:` line each, with the event type inside the
// JSON payload (rather than the SSE `event:` field) so the client needs a
// single code path and unknown types still parse.

export function encodeSseEvent(event: ChatStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export type SseParser = {
  /** Feed a raw network chunk; returns every complete event it contained.
   * Buffers partial lines internally, skips malformed payloads. */
  feed(chunk: string): IncomingChatStreamEvent[];
};

export function createSseParser(): SseParser {
  let buffer = "";

  return {
    feed(chunk: string): IncomingChatStreamEvent[] {
      buffer += chunk;
      const events: IncomingChatStreamEvent[] = [];

      let separatorIndex = buffer.indexOf("\n\n");
      while (separatorIndex !== -1) {
        const rawBlock = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);

        for (const line of rawBlock.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          try {
            const parsed = JSON.parse(payload);
            if (parsed && typeof parsed === "object" && typeof parsed.type === "string") {
              events.push(parsed as IncomingChatStreamEvent);
            }
          } catch {
            // Malformed frame — drop it rather than poisoning the stream.
          }
        }

        separatorIndex = buffer.indexOf("\n\n");
      }

      return events;
    },
  };
}

// --- Client-side message reduction ---
// Pure function so the streaming logic is unit-testable without React.
// Applies one stream event to the in-flight assistant message's parts.

export function applyEventToParts(parts: MessagePart[], event: IncomingChatStreamEvent): MessagePart[] {
  switch (event.type) {
    case "part.start": {
      const e = event as Extract<ChatStreamEvent, { type: "part.start" }>;
      const next = [...parts];
      next[e.partIndex] = e.part;
      return next;
    }
    case "text.delta": {
      const e = event as Extract<ChatStreamEvent, { type: "text.delta" }>;
      const existing = parts[e.partIndex];
      const base: TextPart =
        existing && existing.type === "text" ? (existing as TextPart) : { type: "text", text: "" };
      const next = [...parts];
      next[e.partIndex] = { ...base, text: base.text + e.delta };
      return next;
    }
    case "tool.start": {
      const e = event as Extract<ChatStreamEvent, { type: "tool.start" }>;
      return [
        ...parts,
        {
          type: "tool_activity",
          toolCallId: e.toolCallId,
          toolName: e.toolName,
          label: e.label,
          status: "running",
        } satisfies ToolActivityPart,
      ];
    }
    case "tool.end": {
      const e = event as Extract<ChatStreamEvent, { type: "tool.end" }>;
      return parts.map((part) =>
        part.type === "tool_activity" && (part as ToolActivityPart).toolCallId === e.toolCallId
          ? { ...(part as ToolActivityPart), status: e.status, summary: e.summary }
          : part
      );
    }
    default:
      // Unknown event types are ignored by design (forward compatibility).
      return parts;
  }
}
