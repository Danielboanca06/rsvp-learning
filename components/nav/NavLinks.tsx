"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/spaces", label: "Spaces" },
  { href: "/vocabulary", label: "Vocabulary" },
  { href: "/billing", label: "Billing" },
];

export function NavLinks() {
  const pathname = usePathname();

  return (
    <>
      {LINKS.map((link) => {
        const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "py-1.5 transition-colors hover:text-foreground sm:py-0",
              active ? "text-foreground" : "text-muted"
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </>
  );
}
