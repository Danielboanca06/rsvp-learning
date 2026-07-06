"use client";

import { SignIn } from "@clerk/nextjs";
import { useTheme } from "next-themes";
import { clerkAppearance } from "@/lib/clerk-appearance";

export default function SignInPage() {
  const { resolvedTheme } = useTheme();

  return (
    <div className="flex flex-1 items-center justify-center">
      <SignIn appearance={clerkAppearance(resolvedTheme !== "light")} />
    </div>
  );
}
