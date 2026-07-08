"use client";

// Right-side drawer that reopens an existing chat thread (e.g. from the
// document overview's per-module discussion list) so the user can reread or
// continue it. Thin shell: loads the thread, hosts the reusable ChatPanel.

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useChatThread } from "@/lib/hooks/useChatThread";
import { ChatPanel } from "@/components/chat/ChatPanel";

export function ThreadDrawer({ threadId, onClose }: { threadId: string; onClose: () => void }) {
  const chat = useChatThread();

  useEffect(() => {
    chat.loadThread(threadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  const isPractice = chat.thread?.kind === "practice";

  return (
    <AnimatePresence>
      <motion.div
        key="thread-drawer"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ x: 48, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 48, opacity: 0 }}
          transition={{ type: "spring", stiffness: 280, damping: 32 }}
          className="absolute bottom-0 right-0 top-0 w-full p-4 sm:w-[26rem]"
          onClick={(event) => event.stopPropagation()}
        >
          <ChatPanel
            chat={chat}
            title={isPractice ? "Practice understanding" : "Passage discussion"}
            contextQuote={chat.thread?.selectionText}
            onClose={onClose}
            placeholder={isPractice ? "Write your own summary of the passage..." : "Ask about this passage..."}
          />
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
