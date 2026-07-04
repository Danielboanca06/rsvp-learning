import { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-xl border border-border bg-surface p-4 text-sm text-foreground placeholder:text-muted",
        "focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent",
        "resize-none",
        className
      )}
      {...props}
    />
  );
}
