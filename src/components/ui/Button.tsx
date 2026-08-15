"use client";

import Link from "next/link";

import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost";

const VARIANTS: Record<Variant, string> = {
  // The one loud element in the product. It is the end of the decision.
  primary: "bg-accent text-bg hover:brightness-110 active:brightness-95",
  secondary:
    "bg-transparent text-ink border border-[var(--hairline-strong)] hover:bg-[rgb(var(--text-rgb)/0.06)]",
  ghost: "bg-transparent text-muted hover:text-ink",
};

const BASE = cn(
  "inline-flex items-center justify-center gap-2 select-none",
  // 44px floor — the smallest target that is reliably hittable with a thumb.
  "min-h-11 px-5",
  "text-[0.8125rem] font-medium uppercase tracking-[0.14em]",
  "transition-[background-color,color,filter,border-color] duration-200",
  "disabled:pointer-events-none disabled:opacity-40",
);

type CommonProps = {
  variant?: Variant;
  fullWidth?: boolean;
  className?: string;
  children: React.ReactNode;
};

export function Button({
  variant = "primary",
  fullWidth,
  className,
  children,
  ...props
}: CommonProps & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cn(BASE, VARIANTS[variant], fullWidth && "w-full", className)}
      style={{ borderRadius: "var(--radius-pill)", transitionTimingFunction: "var(--ease)" }}
    >
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  fullWidth,
  className,
  children,
  href,
  ...props
}: CommonProps & React.ComponentProps<typeof Link>) {
  return (
    <Link
      {...props}
      href={href}
      className={cn(BASE, VARIANTS[variant], fullWidth && "w-full", className)}
      style={{ borderRadius: "var(--radius-pill)", transitionTimingFunction: "var(--ease)" }}
    >
      {children}
    </Link>
  );
}
