"use client";

// Overlay that reopens an existing chat thread (e.g. from the document
// overview's per-module discussion list) so the user can reread or continue
// it. Bottom sheet on mobile, right-side panel on desktop. Thin shell: loads
// the thread, hosts the reusable ChatPanel.
//
// Stays mounted with a nullable threadId. Entrance is plain CSS animation and
// close is instant — AnimatePresence exit tracking proved unreliable for this
// overlay (the drawer stayed mounted forever after close), and a dismissal
// that simply disappears is better than one that can wedge open.

import { useEffect, useRef } from "react";
import { useChatThread } from "@/lib/hooks/useChatThread";
import { ChatPanel } from "@/components/chat/ChatPanel";

const SELECTION_SUGGESTIONS = ["Explain more simply", "Give an example", "Why does this matter?"];
const PRACTICE_SUGGESTIONS = ["I'm not sure — give me a hint", "Break it into smaller steps"];

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-4 pt-4">
      <div className="flex justify-end">
        <div className="animate-shimmer h-8 w-1/2 rounded-2xl" />
      </div>
      <div className="animate-shimmer h-3 w-11/12 rounded-full" />
      <div className="animate-shimmer h-3 w-4/5 rounded-full" />
      <div className="animate-shimmer h-3 w-2/3 rounded-full" />
    </div>
  );
}

export function ThreadDrawer({ threadId, onClose }: { threadId: string | null; onClose: () => void }) {
  const chat = useChatThread();
  const openerRef = useRef<Element | null>(null);
  const { loadThread, stop, reset } = chat;

  useEffect(() => {
    if (!threadId) return;
    openerRef.current = document.activeElement;
    // Reset on open (not close) so the exit animation keeps showing the old
    // transcript instead of flashing an empty panel.
    reset();
    loadThread(threadId);
    return () => {
      stop();
      // Hand focus back to whatever opened the drawer (the thread row).
      if (openerRef.current instanceof HTMLElement) openerRef.current.focus();
    };
  }, [threadId, loadThread, stop, reset]);

  const isPractice = chat.thread?.kind === "practice";
  const title = isPractice ? "Practice understanding" : "Passage discussion";

  if (!threadId) return null;

  return (
    <>
      <div
        className="animate-overlay-fade-in fixed inset-0 z-50 bg-background/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="animate-sheet-rise-in fixed inset-x-0 bottom-0 top-14 z-50 flex flex-col rounded-t-3xl border-t border-border bg-surface shadow-lg sm:inset-x-auto sm:right-0 sm:top-0 sm:w-[26rem] sm:rounded-none sm:border-l sm:border-t-0"
      >
        <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-border sm:hidden" />
        <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-2 sm:pt-4">
          <ChatPanel
            chat={chat}
            title={title}
            contextQuote={chat.thread?.selectionText}
            onClose={onClose}
            documentId={chat.thread?.documentId ?? undefined}
            chunkId={chat.thread?.chunkId ?? undefined}
            suggestions={isPractice ? PRACTICE_SUGGESTIONS : SELECTION_SUGGESTIONS}
            loadingFallback={<LoadingSkeleton />}
            placeholder={isPractice ? "Write your own summary of the passage..." : "Ask about this passage..."}
          />
        </div>
      </div>
    </>
  );
}
