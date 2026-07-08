import { describe, expect, it } from "vitest";
import {
  applyEventToParts,
  createSseParser,
  encodeSseEvent,
  type ChatStreamEvent,
  type MessagePart,
  type ToolActivityPart,
} from "@/lib/chat/protocol";

describe("encodeSseEvent / createSseParser", () => {
  it("round-trips an event through SSE framing", () => {
    const event: ChatStreamEvent = { type: "text.delta", partIndex: 0, delta: "Hello" };
    const parser = createSseParser();
    expect(parser.feed(encodeSseEvent(event))).toEqual([event]);
  });

  it("handles multiple events arriving in a single chunk", () => {
    const events: ChatStreamEvent[] = [
      { type: "status", state: "thinking", label: "Thinking" },
      { type: "text.delta", partIndex: 0, delta: "a" },
      { type: "text.delta", partIndex: 0, delta: "b" },
    ];
    const parser = createSseParser();
    expect(parser.feed(events.map(encodeSseEvent).join(""))).toEqual(events);
  });

  it("buffers events split across chunk boundaries, including mid-JSON", () => {
    const event: ChatStreamEvent = { type: "text.delta", partIndex: 0, delta: "split" };
    const wire = encodeSseEvent(event);
    const parser = createSseParser();

    expect(parser.feed(wire.slice(0, 12))).toEqual([]);
    expect(parser.feed(wire.slice(12, 20))).toEqual([]);
    expect(parser.feed(wire.slice(20))).toEqual([event]);
  });

  it("passes through unknown event types instead of throwing", () => {
    const parser = createSseParser();
    const events = parser.feed(`data: {"type":"diagram.delta","svg":"<svg/>"}\n\n`);
    expect(events).toEqual([{ type: "diagram.delta", svg: "<svg/>" }]);
  });

  it("skips malformed frames and frames without a type", () => {
    const parser = createSseParser();
    const good: ChatStreamEvent = { type: "status", state: "generating", label: "Writing" };
    const events = parser.feed(`data: {broken\n\ndata: {"noType":true}\n\n${encodeSseEvent(good)}`);
    expect(events).toEqual([good]);
  });

  it("ignores non-data SSE lines (comments, event names)", () => {
    const parser = createSseParser();
    const good: ChatStreamEvent = { type: "message.start", messageId: "m1", threadId: "t1" };
    const events = parser.feed(`: keep-alive\n\nevent: ping\ndata: ${JSON.stringify(good)}\n\n`);
    expect(events).toEqual([good]);
  });
});

describe("applyEventToParts", () => {
  it("starts a part and accumulates text deltas immutably", () => {
    const initial: MessagePart[] = [];
    const afterStart = applyEventToParts(initial, {
      type: "part.start",
      partIndex: 0,
      part: { type: "text", text: "" },
    });
    const afterDelta = applyEventToParts(afterStart, { type: "text.delta", partIndex: 0, delta: "Hel" });
    const final = applyEventToParts(afterDelta, { type: "text.delta", partIndex: 0, delta: "lo" });

    expect(final).toEqual([{ type: "text", text: "Hello" }]);
    expect(initial).toEqual([]);
    expect(afterDelta).toEqual([{ type: "text", text: "Hel" }]);
  });

  it("creates a text part on delta even without a part.start", () => {
    const parts = applyEventToParts([], { type: "text.delta", partIndex: 0, delta: "hi" });
    expect(parts).toEqual([{ type: "text", text: "hi" }]);
  });

  it("tracks tool lifecycle as a tool_activity part", () => {
    const started = applyEventToParts([], {
      type: "tool.start",
      toolCallId: "call-1",
      toolName: "read_document_context",
      label: "Reading module context",
    });
    expect((started[0] as ToolActivityPart).status).toBe("running");

    const ended = applyEventToParts(started, {
      type: "tool.end",
      toolCallId: "call-1",
      status: "completed",
      summary: "Read 240 words",
    });
    expect(ended[0]).toMatchObject({ type: "tool_activity", status: "completed", summary: "Read 240 words" });
  });

  it("leaves parts untouched for unknown event types", () => {
    const parts: MessagePart[] = [{ type: "text", text: "stable" }];
    expect(applyEventToParts(parts, { type: "citation.added", url: "x" })).toBe(parts);
  });
});
