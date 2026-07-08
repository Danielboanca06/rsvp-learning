"use client";

// Client half of the chat platform: owns one thread's message state and the
// SSE lifecycle of in-flight assistant turns. UI components (ChatPanel) stay
// purely presentational; any surface that needs AI chat composes this hook.

import { useCallback, useRef, useState } from "react";
import {
  applyEventToParts,
  createSseParser,
  type AssistantRunState,
  type ChatMessageDto,
  type ChatStreamEvent,
  type ChatThreadDto,
  type MessagePart,
} from "@/lib/chat/protocol";

export type CreateThreadParams = {
  kind: "selection" | "practice";
  documentId: string;
  chunkId: string;
  selectionText: string;
  parentThreadId?: string;
};

export type StreamingMessage = {
  id: string;
  parts: MessagePart[];
};

export type ChatStatus = {
  state: AssistantRunState;
  label: string;
} | null;

export type ChatError = {
  message: string;
  quotaBlocked: boolean;
} | null;

export function useChatThread() {
  const [thread, setThread] = useState<ChatThreadDto | null>(null);
  const [messages, setMessages] = useState<ChatMessageDto[]>([]);
  const [streaming, setStreaming] = useState<StreamingMessage | null>(null);
  const [status, setStatus] = useState<ChatStatus>(null);
  const [error, setError] = useState<ChatError>(null);
  const [busy, setBusy] = useState(false);
  // Serializes sends: a second sendMessage while a turn streams is dropped.
  const inFlight = useRef(false);

  const reset = useCallback(() => {
    setThread(null);
    setMessages([]);
    setStreaming(null);
    setStatus(null);
    setError(null);
    setBusy(false);
    inFlight.current = false;
  }, []);

  const createThread = useCallback(async (params: CreateThreadParams): Promise<ChatThreadDto | null> => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/chat/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      const json = await response.json();
      if (!response.ok) {
        setError({ message: json.error ?? "Could not start the conversation.", quotaBlocked: false });
        return null;
      }
      setThread(json.thread);
      setMessages(json.thread.messages ?? []);
      return json.thread;
    } catch {
      setError({ message: "Could not start the conversation.", quotaBlocked: false });
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  const loadThread = useCallback(async (threadId: string): Promise<ChatThreadDto | null> => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/chat/threads/${threadId}`);
      const json = await response.json();
      if (!response.ok) {
        setError({ message: json.error ?? "Could not load the conversation.", quotaBlocked: false });
        return null;
      }
      setThread(json.thread);
      setMessages(json.thread.messages ?? []);
      return json.thread;
    } catch {
      setError({ message: "Could not load the conversation.", quotaBlocked: false });
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  const sendMessage = useCallback(
    async (content: string, threadOverride?: ChatThreadDto) => {
      const target = threadOverride ?? thread;
      const trimmed = content.trim();
      if (!target || !trimmed || inFlight.current) return;

      inFlight.current = true;
      setBusy(true);
      setError(null);

      const optimisticUser: ChatMessageDto = {
        id: `local-${Date.now()}`,
        threadId: target.id,
        role: "user",
        parts: [{ type: "text", text: trimmed }],
        status: "complete",
        createdAt: new Date().toISOString(),
      };
      setMessages((previous) => [...previous, optimisticUser]);
      setStatus({ state: "thinking", label: "Thinking" });

      try {
        const response = await fetch(`/api/chat/threads/${target.id}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: trimmed }),
        });

        if (!response.ok || !response.body) {
          const json = await response.json().catch(() => ({}));
          setError({
            message: json.error ?? "The AI could not reply. Please try again.",
            quotaBlocked: response.status === 429,
          });
          setStatus(null);
          return;
        }

        const parser = createSseParser();
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        // Local accumulator: React state updates are async, so the reducer
        // runs against this and the state mirrors it.
        let liveParts: MessagePart[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          for (const event of parser.feed(decoder.decode(value, { stream: true }))) {
            switch (event.type) {
              case "message.start": {
                const e = event as Extract<ChatStreamEvent, { type: "message.start" }>;
                liveParts = [];
                setStreaming({ id: e.messageId, parts: [] });
                break;
              }
              case "status": {
                const e = event as Extract<ChatStreamEvent, { type: "status" }>;
                setStatus(e.state === "completed" ? null : { state: e.state, label: e.label });
                break;
              }
              case "message.end": {
                const e = event as Extract<ChatStreamEvent, { type: "message.end" }>;
                setMessages((previous) => [...previous, e.message]);
                setStreaming(null);
                setStatus(null);
                break;
              }
              case "error": {
                const e = event as Extract<ChatStreamEvent, { type: "error" }>;
                setError({ message: e.message, quotaBlocked: e.code === "quota_exceeded" });
                setStreaming(null);
                setStatus(null);
                break;
              }
              default: {
                // part.start / text.delta / tool.* — and any future event
                // types, which applyEventToParts ignores gracefully.
                liveParts = applyEventToParts(liveParts, event);
                const snapshot = liveParts;
                setStreaming((previous) => (previous ? { ...previous, parts: snapshot } : previous));
              }
            }
          }
        }
      } catch {
        setError({ message: "Connection lost while the AI was replying.", quotaBlocked: false });
        setStreaming(null);
        setStatus(null);
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [thread]
  );

  return {
    thread,
    messages,
    streaming,
    status,
    error,
    busy,
    createThread,
    loadThread,
    sendMessage,
    reset,
  };
}

export type ChatThreadController = ReturnType<typeof useChatThread>;
