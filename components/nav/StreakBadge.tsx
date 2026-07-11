"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { FlameIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

type StreakSummary = { current: number; longest: number; activeToday: boolean };

export function StreakBadge() {
  const pathname = usePathname();
  const [streaks, setStreaks] = useState<StreakSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/streaks")
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) setStreaks(json);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  if (!streaks || streaks.current === 0) return null;

  return (
    <span
      title={`${streaks.current}-day streak (longest: ${streaks.longest})${streaks.activeToday ? "" : " — study today to keep it"}`}
      className={cn(
        "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium",
        streaks.activeToday ? "bg-success-soft text-success" : "bg-accent-soft text-accent"
      )}
    >
      <FlameIcon />
      {streaks.current}d
    </span>
  );
}
