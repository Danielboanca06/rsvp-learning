"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { ArrowRightIcon, CheckIcon, LockIcon, RefreshIcon, SparklesIcon } from "@/components/ui/icons";

export type CourseModuleView = {
  id: string;
  order: number;
  title: string;
  summary: string;
  objectives: string[];
  status: string; // locked | unlocked | generating | ready | completed | failed
  documentId: string | null;
};

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export function ModuleCard({
  module,
  justUnlocked,
  onGenerate,
}: {
  module: CourseModuleView;
  /** Plays the unlock celebration animation once when true. */
  justUnlocked?: boolean;
  onGenerate: (order: number) => void;
}) {
  const locked = module.status === "locked";
  const completed = module.status === "completed";
  const generating = module.status === "generating";

  return (
    <motion.li
      layout
      initial={false}
      animate={
        justUnlocked
          ? { scale: [1, 1.03, 1], boxShadow: ["0 0 0 0 rgba(0,0,0,0)", "0 0 0 6px var(--color-accent-soft)", "0 0 0 0 rgba(0,0,0,0)"] }
          : {}
      }
      transition={{ duration: 0.9, ease: "easeOut" }}
      className={cn(
        "flex items-start gap-4 rounded-2xl border border-border bg-surface p-4",
        locked && "opacity-60",
        completed && "border-success/30"
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
          completed
            ? "bg-success-soft text-success"
            : locked
              ? "bg-background text-muted"
              : "bg-accent-soft text-accent"
        )}
        aria-hidden
      >
        {completed ? <CheckIcon /> : locked ? <LockIcon /> : generating ? <Spinner /> : module.order + 1}
      </span>

      <div className="min-w-0 flex-1">
        <p className="font-medium leading-tight">{module.title}</p>
        <p className="mt-1 text-sm text-muted">{module.summary}</p>
        {generating && <p className="mt-2 text-xs text-accent">Writing this module for you — usually under a minute.</p>}
        {module.status === "failed" && (
          <p className="mt-2 text-xs text-danger">Generation failed — your credits were refunded.</p>
        )}
      </div>

      <div className="shrink-0 self-center">
        {module.status === "unlocked" && (
          <Button icon={<SparklesIcon />} className="w-auto px-4" onClick={() => onGenerate(module.order)}>
            Start
          </Button>
        )}
        {module.status === "failed" && (
          <Button variant="secondary" icon={<RefreshIcon />} className="w-auto px-4" onClick={() => onGenerate(module.order)}>
            Retry
          </Button>
        )}
        {(module.status === "ready" || completed) && module.documentId && (
          <Link href={`/documents/${module.documentId}`}>
            <Button variant={completed ? "ghost" : "primary"} icon={<ArrowRightIcon />} className="w-auto px-4">
              {completed ? "Review" : "Continue"}
            </Button>
          </Link>
        )}
      </div>
    </motion.li>
  );
}
