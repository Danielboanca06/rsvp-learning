"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { BrainIcon } from "@/components/ui/icons";

export function IqPointsBadge() {
  const pathname = usePathname();
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;

    function load() {
      fetch("/api/points")
        .then((res) => res.json())
        .then((json) => {
          if (!cancelled) setTotal(json.total ?? 0);
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

  return (
    <span className="flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent">
      <BrainIcon />
      {total} IQ
    </span>
  );
}
