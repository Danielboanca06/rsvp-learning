"use client";

// Reading-surface wrapper around the chat platform: when the user hits
// "Ask AI" on a highlighted passage this creates a selection thread anchored
// to it and immediately asks the tutor to explain it. From here the user can
// branch into a "Practice understanding" child thread — a separate focused
// exercise tied to the same passage, stored under the document section (via
// parentThreadId) rather than inside this conversation.

import { useEffect, useRef, useState } from "react";
import type { ChatThreadDto } from "@/lib/chat/protocol";
import { useChatThread } from "@/lib/hooks/useChatThread";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { BrainIcon, ArrowRightIcon } from "@/components/ui/icons";

const INITIAL_QUESTION = "Help me understand what this passage means.";

export function SelectionChatPanel({
  documentId,
  chunkId,
  selectionText,
  onClose,
}: {
  documentId: string;
  chunkId: string;
  selectionText: string;
  onClose: () => void;
}) {
  const chat = useChatThread();
  const [selectionThread, setSelectionThread] = useState<ChatThreadDto | null>(null);
  const [mode, setMode] = useState<"selection" | "practice">("selection");
  const bootstrapped = useRef(false);

  useEffect(() => {
    // One bootstrap per mounted panel; the panel remounts (via key) when the
    // user asks about a different selection.
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    (async () => {
      const thread = await chat.createThread({ kind: "selection", documentId, chunkId, selectionText });
      if (thread) {
        setSelectionThread(thread);
        await chat.sendMessage(INITIAL_QUESTION, thread);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startPractice() {
    if (!selectionThread || chat.busy) return;
    const practiceThread = await chat.createThread({
      kind: "practice",
      documentId,
      chunkId,
      selectionText,
      parentThreadId: selectionThread.id,
    });
    if (practiceThread) setMode("practice");
  }

  async function backToDiscussion() {
    if (!selectionThread || chat.busy) return;
    await chat.loadThread(selectionThread.id);
    setMode("selection");
  }

  return (
    <ChatPanel
      chat={chat}
      title={mode === "practice" ? "Practice understanding" : "Ask AI"}
      contextQuote={selectionText}
      onClose={onClose}
      placeholder={mode === "practice" ? "Write your own summary of the passage..." : "Ask about this passage..."}
      headerActions={
        mode === "selection" ? (
          <button
            onClick={startPractice}
            disabled={!selectionThread || chat.busy}
            className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:border-accent/50 hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="inline-flex [&>svg]:h-3.5 [&>svg]:w-3.5">
              <BrainIcon />
            </span>
            Practice understanding
          </button>
        ) : (
          <button
            onClick={backToDiscussion}
            disabled={chat.busy}
            className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="inline-flex rotate-180 [&>svg]:h-3.5 [&>svg]:w-3.5">
              <ArrowRightIcon />
            </span>
            Back to discussion
          </button>
        )
      }
    />
  );
}
