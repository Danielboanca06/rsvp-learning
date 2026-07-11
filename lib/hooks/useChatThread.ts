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
  type TextPart,
} from "@/lib/chat/protocol";

export type CreateThreadParams =
  | {
      kind: "selection" | "practice";
      documentId: string;
      chunkId: string;
      selectionText: string;
      parentThreadId?: string;
    }
  | {
      // Module tutor: one persistent thread per generated course module; the
      // server returns the existing thread when one already exists.
      kind: "module";
      documentId: string;
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
  /** Set when re-sending the failed message is a sensible recovery. */
  retryable: boolean;
} | null;

let optimisticCounter = 0;
function optimisticId(): string {
  optimisticCounter += 1;
  return `local-${Date.now()}-${optimisticCounter}`;
}

function hasStreamedText(parts: MessagePart[]): boolean {
  return parts.some((part) => part.type === "text" && (part as TextPart).text.trim().length > 0);
}

export function useChatThread() {
  const [thread, setThread] = useState<ChatThreadDto | null>(null);
  const [messages, setMessages] = useState<ChatMessageDto[]>([]);
  const [streaming, setStreaming] = useState<StreamingMessage | null>(null);
  const [status, setStatus] = useState<ChatStatus>(null);
  const [error, setError] = useState<ChatError>(null);
  const [busy, setBusy] = useState(false);
  // Serializes sends: a second sendMessage while a turn streams is dropped.
  const inFlight = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  // Last content the user tried to send, for one-tap retry after a failure.
  const lastSent = useRef<string | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setThread(null);
    setMessages([]);
    setStreaming(null);
    setStatus(null);
    setError(null);
    setBusy(false);
    inFlight.current = false;
  }, []);

  /** Cancels the in-flight assistant turn (or bootstrap). Safe to call on
   * unmount — the server still persists whatever the model finishes. */
  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
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
        setError({ message: json.error ?? "Could not start the conversation.", quotaBlocked: false, retryable: false });
        return null;
      }
      setThread(json.thread);
      setMessages(json.thread.messages ?? []);
      return json.thread;
    } catch {
      setError({ message: "Could not start the conversation.", quotaBlocked: false, retryable: false });
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
        setError({ message: json.error ?? "Could not load the conversation.", quotaBlocked: false, retryable: false });
        return null;
      }
      setThread(json.thread);
      setMessages(json.thread.messages ?? []);
      return json.thread;
    } catch {
      setError({ message: "Could not load the conversation.", quotaBlocked: false, retryable: false });
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
      lastSent.current = trimmed;

      const controller = new AbortController();
      abortRef.current = controller;
      const aborted = () => controller.signal.aborted;

      const optimisticUser: ChatMessageDto = {
        id: optimisticId(),
        threadId: target.id,
        role: "user",
        parts: [{ type: "text", text: trimmed }],
        status: "complete",
        createdAt: new Date().toISOString(),
      };
      setMessages((previous) => [...previous, optimisticUser]);
      setStatus({ state: "thinking", label: "Thinking" });

      // Pre-stream failures never persisted the user message server-side, so
      // the optimistic bubble must roll back — otherwise a retry would render
      // the same message twice.
      const rollbackOptimistic = () =>
        setMessages((previous) => previous.filter((message) => message.id !== optimisticUser.id));

      // Local accumulator: React state updates are async, so the reducer
      // runs against this and the state mirrors it. Declared outside the try
      // so the abort path can freeze whatever already streamed.
      let liveParts: MessagePart[] = [];

      try {
        const response = await fetch(`/api/chat/threads/${target.id}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: trimmed }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const json = await response.json().catch(() => ({}));
          const quotaBlocked = response.status === 429;
          rollbackOptimistic();
          setError({
            message: json.error ?? "The AI could not reply. Please try again.",
            quotaBlocked,
            retryable: !quotaBlocked,
          });
          setStatus(null);
          return;
        }

        const parser = createSseParser();
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

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
                setError({
                  message: e.message,
                  quotaBlocked: e.code === "quota_exceeded",
                  // Mid-stream the user message is already persisted, so
                  // "retry" here means asking again — still useful.
                  retryable: e.code !== "quota_exceeded",
                });
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
        if (aborted()) {
          // Deliberate stop (user pressed stop, or the panel unmounted). Keep
          // whatever partial reply already streamed as a frozen local message
          // so the transcript doesn't visibly lose text.
          if (hasStreamedText(liveParts)) {
            const frozen: ChatMessageDto = {
              id: optimisticId(),
              threadId: target.id,
              role: "assistant",
              parts: liveParts,
              status: "complete",
              createdAt: new Date().toISOString(),
            };
            setMessages((existing) => [...existing, frozen]);
          }
          setStreaming(null);
          setStatus(null);
        } else {
          rollbackOptimistic();
          setError({ message: "Connection lost while the AI was replying.", quotaBlocked: false, retryable: true });
          setStreaming(null);
          setStatus(null);
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        inFlight.current = false;
        setBusy(false);
      }
    },
    [thread]
  );

  /** Re-sends the last message that failed. No-op while a turn is in flight. */
  const retry = useCallback(() => {
    if (lastSent.current) void sendMessage(lastSent.current);
  }, [sendMessage]);

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
    retry,
    stop,
    reset,
  };
}

export type ChatThreadController = ReturnType<typeof useChatThread>;
