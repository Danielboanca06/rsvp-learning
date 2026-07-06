import { cn } from "@/lib/cn";

export function ProgressBar({
  value,
  className,
  trackClassName,
}: {
  value: number;
  className?: string;
  trackClassName?: string;
}) {
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-border/60", trackClassName)}>
      <div
        className={cn("h-full rounded-full bg-accent transition-[width] duration-700 ease-out", className)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
