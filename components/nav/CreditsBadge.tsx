"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ZapIcon } from "@/components/ui/icons";

type BillingStatus = {
  plan: "free" | "pro";
  creditBalance: number;
  freeQuotaUsed: number;
  freeQuotaLimit: number;
};

export function CreditsBadge() {
  const pathname = usePathname();
  const [status, setStatus] = useState<BillingStatus | null>(null);

  useEffect(() => {
    let cancelled = false;

    function load() {
      fetch("/api/billing/status")
        .then((res) => res.json())
        .then((json) => {
          if (!cancelled) setStatus(json);
        })
        .catch(() => {});
    }

    load();
    window.addEventListener("focus", load);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", load);
    };
  }, [pathname]);

  if (!status) return null;

  const label =
    status.plan === "pro"
      ? `${status.creditBalance} credits`
      : `${Math.max(status.freeQuotaLimit - status.freeQuotaUsed, 0)} free left`;

  return (
    <Link
      href="/billing"
      className="flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent transition-opacity hover:opacity-80"
    >
      <ZapIcon />
      {label}
    </Link>
  );
}
