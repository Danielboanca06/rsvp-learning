import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { ReviewBadge } from "@/components/nav/ReviewBadge";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-background text-foreground antialiased">
        <header className="border-b border-border">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
            <Link href="/" className="text-sm font-semibold tracking-tight text-foreground">
              Active Recall
            </Link>
            <nav className="flex items-center gap-4 text-sm text-muted sm:gap-6">
              <ReviewBadge />
              <Link href="/" className="transition-colors hover:text-foreground">
                Dashboard
              </Link>
              <Link href="/documents/new" className="transition-colors hover:text-foreground">
                New Document
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
