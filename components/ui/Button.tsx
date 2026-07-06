"use client";

import { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode;
  variant?: ButtonVariant;
  loading?: boolean;
  children: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-foreground shadow-sm hover:bg-accent-hover",
  secondary: "bg-surface text-foreground border border-border hover:bg-surface-hover",
  ghost: "bg-transparent text-foreground border border-border hover:bg-surface",
  destructive: "bg-danger-soft text-danger border border-danger/30 hover:bg-danger/20",
};

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

export function Button({
  icon,
  variant = "primary",
  loading = false,
  disabled,
  children,
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        "flex h-12 w-full min-w-[9rem] items-center justify-center gap-2 rounded-xl text-sm font-medium",
        "transition-[background-color,box-shadow,transform] duration-150 ease-out active:scale-[0.98]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100",
        variantClasses[variant],
        className
      )}
      {...props}
    >
      {(icon || loading) && <span className="flex shrink-0 items-center">{loading ? <Spinner /> : icon}</span>}
      <span className="whitespace-nowrap">{children}</span>
    </button>
  );
}
