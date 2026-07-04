"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { ClockIcon, ArrowRightIcon } from "@/components/ui/icons";

export function ReviewCallout({ dueCount }: { dueCount: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="relative overflow-hidden rounded-2xl border border-accent/30 bg-gradient-to-br from-accent-soft via-surface to-surface p-6"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-white">
            <ClockIcon />
            <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-accent" />
            </span>
          </span>
          <div>
            <p className="text-lg font-semibold tracking-tight">
              {dueCount} {dueCount === 1 ? "card is" : "cards are"} due for review
            </p>
            <p className="mt-0.5 text-sm text-muted">Spaced right at the edge of forgetting.</p>
          </div>
        </div>
        <Link href="/review" className="w-full sm:w-auto">
          <Button icon={<ArrowRightIcon />} className="w-full sm:w-auto sm:px-8">
            Start Review
          </Button>
        </Link>
      </div>
    </motion.div>
  );
}
