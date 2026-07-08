"use client";

// Live status block: renders the backend's execution state (thinking, calling
// tools, generating, ...) while an assistant turn streams, so the user can see
// what the AI is doing before text arrives.

import { motion } from "framer-motion";
import type { ChatStatus } from "@/lib/hooks/useChatThread";

export function StatusBlock({ status }: { status: NonNullable<ChatStatus> }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2 text-xs text-muted"
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
      </span>
      <span>{status.label}…</span>
    </motion.div>
  );
}
