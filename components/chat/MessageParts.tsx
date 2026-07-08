"use client";

// Renderer registry for typed message parts. Each part type maps to a
// component; unknown types render nothing (forward compatibility — an older
// client must not crash when the server starts emitting charts, citations,
// cards, ...). New part types: add a case here, nothing else changes.

import type { MessagePart, TextPart, ToolActivityPart } from "@/lib/chat/protocol";
import { CheckIcon, SearchIcon, XIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

function TextPartView({ part }: { part: TextPart }) {
  if (!part.text) return null;
  return <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{part.text}</p>;
}

function ToolActivityPartView({ part }: { part: ToolActivityPart }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border border-border/60 bg-background/60 px-2.5 py-1.5 text-xs",
        part.status === "failed" ? "text-danger" : "text-muted"
      )}
    >
      <span className="inline-flex shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5">
        {part.status === "running" ? (
          <SearchIcon className="animate-pulse" />
        ) : part.status === "failed" ? (
          <XIcon />
        ) : (
          <CheckIcon />
        )}
      </span>
      <span className="truncate">{part.status === "running" ? part.label : (part.summary ?? part.label)}</span>
    </div>
  );
}

export function MessagePartsView({ parts }: { parts: MessagePart[] }) {
  return (
    <div className="flex flex-col gap-2">
      {parts.map((part, index) => {
        switch (part.type) {
          case "text":
            return <TextPartView key={index} part={part as TextPart} />;
          case "tool_activity":
            return <ToolActivityPartView key={index} part={part as ToolActivityPart} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
