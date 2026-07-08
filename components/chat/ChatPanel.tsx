"use client";

// Reusable chat surface for the AI platform: message history, live status
// blocks, streaming assistant output, and an input box. Presentation only —
// all state and streaming live in useChatThread, so any screen can host a
// panel by composing the hook and passing its controller in.

import { FormEvent, KeyboardEvent, ReactNode, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ChatMessageDto } from "@/lib/chat/protocol";
import type { ChatThreadController } from "@/lib/hooks/useChatThread";
import { MessagePartsView } from "@/components/chat/MessageParts";
import { StatusBlock } from "@/components/chat/StatusBlock";
import { SendIcon, SparklesIcon, XIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

function MessageRow({ message }: { message: Pick<ChatMessageDto, "role" | "parts"> }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2.5",
          isUser ? "bg-accent-soft text-foreground" : "bg-transparent"
        )}
      >
        <MessagePartsView parts={message.parts} />
      </div>
    </div>
  );
}

export function ChatPanel({
  chat,
  title,
  contextQuote,
  onClose,
  headerActions,
  placeholder = "Ask about this passage...",
}: {
  chat: ChatThreadController;
  title: string;
  /** The passage this conversation is anchored to, pinned under the header. */
  contextQuote?: string | null;
  onClose?: () => void;
  /** Surface-specific actions (e.g. "Practice understanding"). */
  headerActions?: ReactNode;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, streaming, status, error, busy } = chat;

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, streaming, status]);

  function submit() {
    const content = draft.trim();
    if (!content || busy) return;
    setDraft("");
    chat.sendMessage(content);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-border bg-surface">
      <div className="flex items-start justify-between gap-2 border-b border-border p-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex shrink-0 text-accent [&>svg]:h-4 [&>svg]:w-4">
            <SparklesIcon />
          </span>
          <p className="truncate text-sm font-medium">{title}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {headerActions}
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Close chat"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:text-foreground"
            >
              <XIcon />
            </button>
          )}
        </div>
      </div>

      {contextQuote && (
        <blockquote className="mx-4 mt-3 border-l-2 border-accent/60 pl-3 text-xs italic leading-relaxed text-muted">
          &ldquo;{contextQuote.length > 220 ? `${contextQuote.slice(0, 217).trimEnd()}...` : contextQuote}&rdquo;
        </blockquote>
      )}

      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {messages.map((message) => (
          <MessageRow key={message.id} message={message} />
        ))}
        {streaming && streaming.parts.length > 0 && <MessageRow message={{ role: "assistant", parts: streaming.parts }} />}
        {status && <StatusBlock status={status} />}
        {error && (
          <div className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
            {error.message}
            {error.quotaBlocked && (
              <>
                {" "}
                <Link href="/billing" className="font-medium underline">
                  Upgrade
                </Link>
              </>
            )}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-border p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={2}
            className="max-h-32 w-full resize-none rounded-xl border border-border bg-background p-3 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            aria-label="Send message"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            <SendIcon />
          </button>
        </div>
      </form>
    </div>
  );
}
