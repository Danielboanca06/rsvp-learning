"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { IqPointsBadge } from "@/components/nav/IqPointsBadge";
import { CreditsBadge } from "@/components/nav/CreditsBadge";
import { ReviewBadge } from "@/components/nav/ReviewBadge";
import { NavLinks } from "@/components/nav/NavLinks";
import { MenuIcon, XIcon } from "@/components/ui/icons";

export function MobileNavMenu() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const containerRef = useRef<HTMLDivElement>(null);

  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  return (
    <div ref={containerRef} className="relative sm:hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:border-accent/40"
      >
        {open ? <XIcon /> : <MenuIcon />}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 flex w-64 flex-col gap-4 rounded-2xl border border-border bg-surface p-4 shadow-lg">
          <div className="flex flex-wrap items-center gap-2">
            <IqPointsBadge />
            <CreditsBadge />
            <ReviewBadge />
          </div>
          <nav className="flex flex-col gap-1 text-sm">
            <NavLinks />
          </nav>
        </div>
      )}
    </div>
  );
}
