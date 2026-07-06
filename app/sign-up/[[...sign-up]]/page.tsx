"use client";

import { SignUp } from "@clerk/nextjs";
import { useTheme } from "next-themes";
import { clerkAppearance } from "@/lib/clerk-appearance";

export default function SignUpPage() {
  const { resolvedTheme } = useTheme();

  return (
    <div className="flex flex-1 items-center justify-center">
      <SignUp appearance={clerkAppearance(resolvedTheme !== "light")} />
    </div>
  );
}
