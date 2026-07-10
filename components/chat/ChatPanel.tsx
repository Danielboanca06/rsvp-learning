"use client";

// Reusable chat surface for the AI platform: message history, live status
// blocks, streaming assistant output, and an input box. Presentation only —
// all state and streaming live in useChatThread, so any screen can host a
// panel by composing the hook and passing its controller in.
//
// Deliberately chrome-less: no card container. The panel leans on the page
// background; the composer is the one bordered object. Hosts that overlay it
// (mobile sheet, thread drawer) supply their own surface.

import {
  FormEvent,
  KeyboardEvent,
  ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import type { ChatMessageDto, MessagePart, TextPart } from "@/lib/chat/protocol";
import type { ChatThreadController } from "@/lib/hooks/useChatThread";
import { MessagePartsView } from "@/components/chat/MessageParts";
import { StatusBlock } from "@/components/chat/StatusBlock";
import { SelectionDefinePopover } from "@/components/rsvp/SelectionDefinePopover";
import { ArrowDownIcon, CheckIcon, CopyIcon, SendIcon, SparklesIcon, StopIcon, XIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

const CONTEXT_QUOTE_CLAMP = 220;
const STICK_THRESHOLD_PX = 48;

function textOfParts(parts: MessagePart[]): string {
  return parts
    .filter((part): part is TextPart => part.type === "text")
    .map((part) => part.text)
    .join("\n\n");
}

function CopyButton({ parts }: { parts: MessagePart[] }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(textOfParts(parts));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (permissions/insecure context) — nothing to do.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Copied" : "Copy reply"}
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded-md text-muted/70 opacity-0 transition-all focus-visible:opacity-100 group-hover:opacity-100",
        copied ? "text-success opacity-100" : "hover:bg-surface-hover hover:text-foreground"
      )}
    >
      <span className="inline-flex [&>svg]:h-3.5 [&>svg]:w-3.5">{copied ? <CheckIcon /> : <CopyIcon />}</span>
    </button>
  );
}

function MessageRow({ message }: { message: Pick<ChatMessageDto, "role" | "parts"> }) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[82%] rounded-2xl rounded-br-md bg-accent-soft px-3.5 py-2 text-foreground">
          <MessagePartsView parts={message.parts} markdown={false} />
        </div>
      </div>
    );
  }

  // Assistant replies are borderless prose — the tutor speaking into the
  // column — with a hover-revealed copy affordance.
  return (
    <div className="group flex flex-col gap-1">
      <div className="min-w-0 max-w-full text-foreground/90">
        <MessagePartsView parts={message.parts} />
      </div>
      <div className="flex justify-start">
        <CopyButton parts={message.parts} />
      </div>
    </div>
  );
}

function WelcomeState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-soft text-accent [&>svg]:h-5 [&>svg]:w-5">
        <SparklesIcon />
      </span>
      <p className="font-display text-base tracking-tight text-foreground">{title}</p>
      <p className="text-xs leading-relaxed text-muted">{hint}</p>
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
  suggestions,
  documentId,
  chunkId,
  loadingFallback,
}: {
  chat: ChatThreadController;
  title: string;
  /** The passage this conversation is anchored to, pinned under the header. */
  contextQuote?: string | null;
  onClose?: () => void;
  /** Surface-specific actions (e.g. "Practice understanding"). */
  headerActions?: ReactNode;
  placeholder?: string;
  /** One-tap follow-ups shown above the composer after an assistant reply. */
  suggestions?: string[];
  /** When set, selecting text in the transcript offers the Define pill. */
  documentId?: string;
  chunkId?: string;
  /** Rendered while the thread loads with no messages yet (e.g. drawer skeleton). */
  loadingFallback?: ReactNode;
}) {
  const [draft, setDraft] = useState("");
  const [composerFocused, setComposerFocused] = useState(false);
  const [quoteExpanded, setQuoteExpanded] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const atBottomRef = useRef(true);

  const { messages, streaming, status, error, busy } = chat;

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const node = scrollRef.current;
    if (node) node.scrollTo({ top: node.scrollHeight, behavior });
  }, []);

  function handleScroll() {
    const node = scrollRef.current;
    if (!node) return;
    const nearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < STICK_THRESHOLD_PX;
    atBottomRef.current = nearBottom;
    setAtBottom(nearBottom);
  }

  // Follow the stream only while the user is at the bottom; scrolling up to
  // reread must never be yanked back down by the next token.
  useLayoutEffect(() => {
    if (atBottomRef.current) scrollToBottom();
  }, [messages, streaming, status, scrollToBottom]);

  // Escape closes the panel; the composer keeps focus for immediate typing.
  useEffect(() => {
    if (!onClose) return;
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented) onClose?.();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  function resizeTextarea() {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 128)}px`;
  }

  function submit() {
    const content = draft.trim();
    if (!content || busy) return;
    setDraft("");
    // Reset the auto-grown height for the next draft.
    requestAnimationFrame(resizeTextarea);
    atBottomRef.current = true;
    setAtBottom(true);
    chat.sendMessage(content);
    textareaRef.current?.focus();
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

  const streamingHasText = streaming !== null && streaming.parts.some((part) => part.type === "text" && (part as TextPart).text.length > 0);
  const isEmpty = messages.length === 0 && !streaming;
  const quoteTooLong = (contextQuote?.length ?? 0) > CONTEXT_QUOTE_CLAMP;
  const showSuggestions =
    !!suggestions?.length && !busy && !error && messages.length > 0 && messages[messages.length - 1].role === "assistant";

  return (
    <div className="flex h-full min-h-0 flex-col bg-transparent">
      <div className="flex items-center justify-between gap-2 px-1 pb-3 pt-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex shrink-0 text-accent/80 [&>svg]:h-3.5 [&>svg]:w-3.5">
            <SparklesIcon />
          </span>
          <p className="truncate font-display text-base tracking-tight text-foreground">{title}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {headerActions}
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Close chat"
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              <XIcon />
            </button>
          )}
        </div>
      </div>

      {contextQuote && (
        <div className="mx-1 mb-3 rounded-xl border-l-2 border-accent/50 bg-surface-hover/60 py-2.5 pl-3 pr-3">
          <p className="mb-1 flex items-center gap-1.5 text-[0.6875rem] font-medium uppercase tracking-wide text-muted">
            <span className="text-accent/70">&ldquo;</span>
            From the passage
          </p>
          <blockquote
            className={cn(
              "text-[0.8125rem] italic leading-snug text-foreground/75",
              !quoteExpanded && "line-clamp-2",
              quoteExpanded && "max-h-40 overflow-y-auto"
            )}
          >
            {contextQuote}
          </blockquote>
          {quoteTooLong && (
            <button
              type="button"
              onClick={() => setQuoteExpanded((previous) => !previous)}
              className="mt-1 text-[0.6875rem] font-medium text-accent transition-colors hover:text-accent-hover"
            >
              {quoteExpanded ? "Show less" : "Show full passage"}
            </button>
          )}
        </div>
      )}

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          role="log"
          aria-live="polite"
          aria-busy={busy}
          className="-mx-1 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-1 pt-2 [mask-image:linear-gradient(to_bottom,transparent,black_12px)]"
        >
          {isEmpty &&
            (busy ? (
              (loadingFallback ?? (
                <WelcomeState title="Reading the passage..." hint="I'll explain it, then you can test yourself." />
              ))
            ) : (
              <WelcomeState title="Ask anything about this passage" hint="Explanations, examples, or a quick practice round." />
            ))}
          {messages.map((message) => (
            <MessageRow key={message.id} message={message} />
          ))}
          {streaming && streaming.parts.length > 0 && <MessageRow message={{ role: "assistant", parts: streaming.parts }} />}
          {/* Once tokens are visibly streaming, a "Writing a reply..." line under
              them reads as a stuck spinner — show status only before that. */}
          {status && !streamingHasText && <StatusBlock status={status} />}
          {error && (
            <div className="flex flex-col items-start gap-2 rounded-xl bg-danger-soft px-3 py-2.5 text-xs text-danger">
              <p>
                {error.message}
                {error.quotaBlocked && (
                  <>
                    {" "}
                    <Link href="/billing" className="font-medium underline">
                      Upgrade
                    </Link>
                  </>
                )}
              </p>
              {error.retryable && (
                <button
                  type="button"
                  onClick={() => chat.retry()}
                  className="rounded-full bg-danger/10 px-2.5 py-1 font-medium transition-colors hover:bg-danger/20"
                >
                  Try again
                </button>
              )}
            </div>
          )}
        </div>

        {!atBottom && (
          <button
            type="button"
            onClick={() => {
              atBottomRef.current = true;
              setAtBottom(true);
              scrollToBottom("smooth");
            }}
            aria-label="Jump to latest"
            className="absolute bottom-3 right-2 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface text-muted shadow-md transition-colors hover:text-foreground"
          >
            <span className="inline-flex [&>svg]:h-4 [&>svg]:w-4">
              <ArrowDownIcon />
            </span>
          </button>
        )}

        {documentId && chunkId && (
          <SelectionDefinePopover containerRef={scrollRef} documentId={documentId} chunkId={chunkId} />
        )}
      </div>

      {showSuggestions && (
        <div className="flex flex-wrap gap-1.5 px-1 pt-3">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => {
                atBottomRef.current = true;
                setAtBottom(true);
                chat.sendMessage(suggestion);
              }}
              className="rounded-full bg-surface-hover/70 px-3 py-1.5 text-xs text-muted transition-colors hover:bg-accent-soft hover:text-accent"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="px-1 pt-3">
        <div className="flex items-end gap-2 rounded-2xl border border-border bg-surface px-2.5 py-2 shadow-sm transition-colors focus-within:border-accent/60 focus-within:ring-1 focus-within:ring-accent/30">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              resizeTextarea();
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => setComposerFocused(true)}
            onBlur={() => setComposerFocused(false)}
            placeholder={placeholder}
            rows={1}
            className="max-h-32 min-h-[2.5rem] w-full resize-none bg-transparent px-1.5 py-1.5 text-[0.9375rem] leading-relaxed text-foreground placeholder:text-muted focus:outline-none"
          />
          {busy ? (
            <button
              type="button"
              onClick={() => chat.stop()}
              aria-label="Stop generating"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-hover text-foreground transition-colors hover:text-danger"
            >
              <StopIcon />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!draft.trim()}
              aria-label="Send message"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground transition-all hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-hover disabled:text-muted"
            >
              <SendIcon />
            </button>
          )}
        </div>
        <p
          className={cn(
            "h-5 px-2 pt-1.5 text-[0.6875rem] text-muted/70 transition-opacity",
            composerFocused && draft.trim() ? "opacity-100" : "opacity-0"
          )}
        >
          Enter to send · Shift+Enter for a new line
        </p>
      </form>
    </div>
  );
}
