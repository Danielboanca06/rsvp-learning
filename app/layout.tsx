import type { Metadata } from "next";
import { Fraunces, Karla } from "next/font/google";
import Link from "next/link";
import { ThemeProvider } from "next-themes";
import { ClerkProvider, Show, SignInButton, UserButton } from "@clerk/nextjs";
import { NavLinks } from "@/components/nav/NavLinks";
import { ThemeToggle } from "@/components/nav/ThemeToggle";
import { ReviewBadge } from "@/components/nav/ReviewBadge";
import { IqPointsBadge } from "@/components/nav/IqPointsBadge";
import { CreditsBadge } from "@/components/nav/CreditsBadge";
import { StreakBadge } from "@/components/nav/StreakBadge";
import { MobileNavMenu } from "@/components/nav/MobileNavMenu";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

const karla = Karla({
  variable: "--font-karla",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Active Recall",
  description: "RSVP speed reading with LLM-graded active recall",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${fraunces.variable} ${karla.variable} h-full`}>
      <body className="flex min-h-full flex-col bg-background font-sans text-foreground antialiased">
        <ClerkProvider>
          <ThemeProvider attribute="data-theme" defaultTheme="dark">
            <header className="border-b border-border">
              <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
                <Link
                  href="/"
                  className="shrink-0 font-display text-lg italic tracking-tight text-foreground"
                >
                  Active Recall
                </Link>
                <nav className="flex items-center gap-3 text-sm sm:gap-4">
                  <Show when="signed-in">
                    <div className="hidden items-center gap-4 sm:flex sm:gap-6">
                      <StreakBadge />
                      <IqPointsBadge />
                      <CreditsBadge />
                      <ReviewBadge />
                      <NavLinks />
                    </div>
                  </Show>
                  <ThemeToggle />
                  <Show when="signed-out">
                    <SignInButton mode="modal">
                      <button className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover">
                        Sign in
                      </button>
                    </SignInButton>
                  </Show>
                  <Show when="signed-in">
                    <UserButton />
                    <MobileNavMenu />
                  </Show>
                </nav>
              </div>
            </header>
            <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-10">
              {children}
            </main>
          </ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
