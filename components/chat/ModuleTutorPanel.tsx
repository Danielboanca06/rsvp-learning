"use client";

// Course-module tutor surface: opens (or resumes) the ONE persistent "module"
// thread anchored to a generated module's document. The server dedupes thread
// creation, so mounting this panel twice for the same module always lands in
// the same conversation. Hosts supply the sheet/aside chrome.

import { useEffect, useRef } from "react";
import { useChatThread } from "@/lib/hooks/useChatThread";
import { ChatPanel } from "@/components/chat/ChatPanel";

const TUTOR_SUGGESTIONS = ["Quiz me on this module", "Explain the hardest idea again", "How does this connect to my goal?"];

export function ModuleTutorPanel({
  documentId,
  moduleTitle,
  onClose,
  pendingQuote,
  onPendingQuoteHandled,
}: {
  documentId: string;
  moduleTitle: string;
  onClose: () => void;
  /** A passage selected via "Ask AI" — asked into this same persistent thread
   * instead of spawning a separate selection thread. */
  pendingQuote?: string | null;
  onPendingQuoteHandled?: () => void;
}) {
  const chat = useChatThread();
  const bootstrapped = useRef(false);
  const lastAskedQuote = useRef<string | null>(null);

  useEffect(() => {
    if (!bootstrapped.current) {
      bootstrapped.current = true;
      void chat.createThread({ kind: "module", documentId });
    }
    return () => chat.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!pendingQuote || !chat.thread || pendingQuote === lastAskedQuote.current) return;
    lastAskedQuote.current = pendingQuote;
    chat.sendMessage(`Help me understand this passage:\n\n"${pendingQuote}"`);
    onPendingQuoteHandled?.();
  }, [pendingQuote, chat.thread, chat, onPendingQuoteHandled]);

  return (
    <ChatPanel
      chat={chat}
      title={`Tutor · ${moduleTitle}`}
      onClose={onClose}
      documentId={documentId}
      suggestions={TUTOR_SUGGESTIONS}
      placeholder="Ask your tutor anything about this module..."
    />
  );
}
