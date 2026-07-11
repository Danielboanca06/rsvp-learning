"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { ZapIcon } from "@/components/ui/icons";

type BillingStatus = {
  plan: "free" | "trial" | "pro";
  trialEndsAt: string | null;
  creditBalance: number;
  freeQuotaUsed: number;
  freeQuotaLimit: number;
};

type CheckoutKind = "subscription" | "subscription_annual" | "topup_small" | "topup_large";

const PLAN_LABELS: Record<BillingStatus["plan"], string> = { free: "Free", trial: "Trial", pro: "Pro" };

function trialDaysLeft(trialEndsAt: string): number {
  return Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

function BillingPageInner() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [pendingKind, setPendingKind] = useState<CheckoutKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/billing/status")
      .then((res) => res.json())
      .then(setStatus)
      .catch(() => {});
  }, []);

  async function startCheckout(kind: CheckoutKind) {
    setPendingKind(kind);
    setError(null);
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not start checkout.");
      window.location.href = body.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setPendingKind(null);
    }
  }

  const checkoutResult = searchParams.get("checkout");

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-3xl italic tracking-tight">Billing</h1>
        <p className="mt-1 text-sm text-muted">Manage your plan and AI credits.</p>
      </div>

      {checkoutResult === "success" && (
        <p className="rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent">
          Thanks! Your purchase is being processed and should reflect here shortly.
        </p>
      )}
      {checkoutResult === "cancelled" && (
        <p className="rounded-lg bg-surface px-4 py-3 text-sm text-muted">Checkout was cancelled.</p>
      )}
      {error && <p className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}

      {!status ? (
        <Card className="flex flex-col gap-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-8 w-48" />
        </Card>
      ) : (
        <Card className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent">
              <ZapIcon />
            </span>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Current plan</p>
              <p className="font-display text-2xl italic">{PLAN_LABELS[status.plan]}</p>
            </div>
          </div>
          {status.plan !== "free" ? (
            <p className="text-sm text-muted">
              <span className="font-medium text-foreground">{status.creditBalance}</span> credits remaining.
              {status.plan === "trial" && status.trialEndsAt && (
                <> Trial ends in {trialDaysLeft(status.trialEndsAt)} day{trialDaysLeft(status.trialEndsAt) === 1 ? "" : "s"} — upgrade to keep building courses.</>
              )}
            </p>
          ) : (
            <p className="text-sm text-muted">
              <span className="font-medium text-foreground">
                {Math.max(status.freeQuotaLimit - status.freeQuotaUsed, 0)}
              </span>{" "}
              of {status.freeQuotaLimit} free AI actions left this month.
            </p>
          )}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card className="flex flex-col gap-4">
          <div>
            <p className="font-display text-xl italic">Pro · monthly</p>
            <p className="mt-1 text-sm text-muted">500 credits every month — AI courses, tutor, and grading without caps.</p>
          </div>
          <Button
            loading={pendingKind === "subscription"}
            disabled={status?.plan === "pro"}
            onClick={() => startCheckout("subscription")}
          >
            {status?.plan === "pro" ? "Current plan" : "Upgrade to Pro"}
          </Button>
        </Card>

        <Card className="flex flex-col gap-4 border-accent/40">
          <div>
            <p className="font-display text-xl italic">Pro · annual</p>
            <p className="mt-1 text-sm text-muted">The same Pro, around 30% cheaper over a year.</p>
          </div>
          <Button
            loading={pendingKind === "subscription_annual"}
            disabled={status?.plan === "pro"}
            onClick={() => startCheckout("subscription_annual")}
          >
            {status?.plan === "pro" ? "Current plan" : "Go annual & save"}
          </Button>
        </Card>

        <Card className="flex flex-col gap-4">
          <div>
            <p className="font-display text-xl italic">Top-up (small)</p>
            <p className="mt-1 text-sm text-muted">Add credits without waiting for renewal.</p>
          </div>
          <Button
            variant="secondary"
            loading={pendingKind === "topup_small"}
            onClick={() => startCheckout("topup_small")}
          >
            Buy credits
          </Button>
        </Card>

        <Card className="flex flex-col gap-4">
          <div>
            <p className="font-display text-xl italic">Top-up (large)</p>
            <p className="mt-1 text-sm text-muted">Best value for heavy usage.</p>
          </div>
          <Button
            variant="secondary"
            loading={pendingKind === "topup_large"}
            onClick={() => startCheckout("topup_large")}
          >
            Buy credits
          </Button>
        </Card>
      </div>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<Skeleton className="h-8 w-48" />}>
      <BillingPageInner />
    </Suspense>
  );
}
