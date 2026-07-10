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
}: {
  documentId: string;
  moduleTitle: string;
  onClose: () => void;
}) {
  const chat = useChatThread();
  const bootstrapped = useRef(false);

  useEffect(() => {
    if (!bootstrapped.current) {
      bootstrapped.current = true;
      void chat.createThread({ kind: "module", documentId });
    }
    return () => chat.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
