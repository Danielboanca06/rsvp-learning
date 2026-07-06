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
      className="flex flex-col gap-4 rounded-2xl border border-accent/25 bg-accent-soft p-6 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-center gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <ClockIcon />
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
    </motion.div>
  );
}
