"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClockIcon } from "@/components/ui/icons";

export function ReviewBadge() {
  const pathname = usePathname();
  const [dueCount, setDueCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    function load() {
      fetch("/api/reviews")
        .then((res) => res.json())
        .then((json) => {
          if (!cancelled) setDueCount(json.dueCount ?? 0);
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

  if (dueCount === 0) return null;

  return (
    <Link
      href="/review"
      className="flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
    >
      <ClockIcon />
      {dueCount} due
    </Link>
  );
}
