"use client";

// One-time end-of-trial pitch: shown on the dashboard the first time a user
// arrives after their trial expired (plan back to "free", trialEndsAt in the
// past). Dismissal is remembered locally; the /billing page remains the
// durable upgrade surface.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { SparklesIcon, XIcon } from "@/components/ui/icons";

const DISMISSED_KEY = "trial-ended-modal-dismissed";
// Don't resurrect the pitch for users whose trial ended ages ago (e.g. after
// clearing local storage).
const RELEVANCE_WINDOW_DAYS = 14;

type BillingStatus = { plan: "free" | "trial" | "pro"; trialEndsAt: string | null };

export function TrialEndedModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (window.localStorage.getItem(DISMISSED_KEY)) return;
    let cancelled = false;
    fetch("/api/billing/status")
      .then((res) => res.json())
      .then((status: BillingStatus) => {
        if (cancelled || status.plan !== "free" || !status.trialEndsAt) return;
        const endedAgoMs = Date.now() - new Date(status.trialEndsAt).getTime();
        if (endedAgoMs > 0 && endedAgoMs < RELEVANCE_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
          setOpen(true);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function dismiss() {
    window.localStorage.setItem(DISMISSED_KEY, "1");
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="animate-overlay-fade-in absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={dismiss} />
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-lg">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
        >
          <XIcon />
        </button>
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
          <SparklesIcon />
        </span>
        <h2 className="mt-4 font-display text-2xl italic">Your trial has ended</h2>
        <p className="mt-2 text-sm text-muted">
          Your courses and everything you&apos;ve learned stay right here. To keep generating new modules and courses,
          upgrade to Pro — the annual plan saves about 30% versus monthly.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Link href="/billing" className="w-full">
            <Button icon={<SparklesIcon />}>See Pro plans</Button>
          </Link>
          <Button variant="ghost" onClick={dismiss}>
            Maybe later
          </Button>
        </div>
      </div>
    </div>
  );
}
