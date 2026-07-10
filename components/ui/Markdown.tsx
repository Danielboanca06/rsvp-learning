"use client";

// Shared markdown renderer for AI-generated content. Two sizes: "chat" for the
// compact side-panel replies, "reading" for module content on the reading
// surface. Both are deliberately conservative — the prompts only allow light
// structure (emphasis, short lists, inline code, occasional heading), and the
// styles here match the app's warm-paper aesthetic rather than a generic
// prose reset. The accent left-border is reserved for the pinned context
// quote in ChatPanel; blockquotes here use the plain border so the two read
// as different objects.

import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/cn";

type MarkdownSize = "chat" | "reading";

function componentsFor(size: MarkdownSize): Components {
  const isChat = size === "chat";
  // Chat headings stay at body scale — big headings in a 24rem column look
  // broken. Reading headings can afford the display face at real sizes.
  const heading = isChat
    ? "font-display text-[0.9375rem] font-semibold tracking-tight text-foreground"
    : "font-display text-xl italic tracking-tight text-foreground";

  return {
    p: ({ children }) => <p>{children}</p>,
    strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    a: ({ href, children }) => (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="text-accent underline decoration-accent/30 underline-offset-2 transition-colors hover:decoration-accent"
      >
        {children}
      </a>
    ),
    ul: ({ children }) => (
      <ul
        className={cn(
          "my-1 flex flex-col gap-1.5",
          "[&>li]:relative [&>li]:pl-4",
          "[&>li]:before:absolute [&>li]:before:left-0 [&>li]:before:top-[0.62em] [&>li]:before:h-1 [&>li]:before:w-1 [&>li]:before:rounded-full [&>li]:before:bg-accent/60 [&>li]:before:content-['']",
          "[&_ul]:mt-1.5 [&_ul]:pl-4"
        )}
      >
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="my-1 flex list-decimal flex-col gap-1.5 pl-5 marker:text-muted">{children}</ol>
    ),
    li: ({ children }) => <li className="leading-[1.6]">{children}</li>,
    code: ({ children, className }) =>
      className ? (
        // Block code (inside <pre>): className carries the language.
        <code className={cn("font-mono", className)}>{children}</code>
      ) : (
        <code className="rounded-md bg-surface-hover px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">
          {children}
        </code>
      ),
    pre: ({ children }) => (
      <pre className="overflow-x-auto rounded-xl bg-surface-hover p-3 text-[0.8125rem] leading-relaxed">{children}</pre>
    ),
    blockquote: ({ children }) => (
      <blockquote className="border-l-2 border-border pl-3 italic text-muted">{children}</blockquote>
    ),
    h1: ({ children }) => <h3 className={heading}>{children}</h3>,
    h2: ({ children }) => <h3 className={heading}>{children}</h3>,
    h3: ({ children }) => <h4 className={heading}>{children}</h4>,
    h4: ({ children }) => <h4 className={heading}>{children}</h4>,
    hr: () => <hr className="my-1 border-border/70" />,
    table: ({ children }) => (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    ),
    th: ({ children }) => (
      <th className="border-b border-border px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted">
        {children}
      </th>
    ),
    td: ({ children }) => <td className="border-b border-border/50 px-2 py-1.5 align-top">{children}</td>,
  };
}

const CHAT_COMPONENTS = componentsFor("chat");
const READING_COMPONENTS = componentsFor("reading");

export const Markdown = memo(function Markdown({
  children,
  size = "chat",
  className,
}: {
  children: string;
  size?: MarkdownSize;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 select-text flex-col",
        size === "chat"
          ? "gap-3 text-[0.9375rem] leading-[1.7] text-foreground/90"
          : "gap-4 text-lg leading-relaxed text-foreground/90",
        className
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={size === "chat" ? CHAT_COMPONENTS : READING_COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  );
});
