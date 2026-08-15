import Link from "next/link";

import { cn } from "@/lib/cn";

/**
 * Section opener.
 *
 * A small-caps eyebrow over an optional serif line. The rule underneath is the
 * device that makes the page read as edited pages rather than stacked widgets —
 * it is deliberately a hairline, not a divider.
 */
export function SectionHeading({
  eyebrow,
  title,
  action,
  className,
}: {
  eyebrow: string;
  title?: string;
  action?: { label: string; href: string };
  className?: string;
}) {
  return (
    <div className={cn("mb-4", className)}>
      <div className="flex items-baseline justify-between gap-4">
        <span className="eyebrow">{eyebrow}</span>
        {action && (
          <Link
            href={action.href}
            className="text-muted hover:text-ink text-xs transition-colors duration-200"
          >
            {action.label}
          </Link>
        )}
      </div>

      {title && (
        <h2 className="font-display text-ink mt-2.5 text-[1.75rem] text-balance">{title}</h2>
      )}

      <div className="mt-3 h-px" style={{ background: "var(--hairline)" }} />
    </div>
  );
}

/** Standard page section spacing, so every screen breathes identically. */
export function Section({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <section className={cn("mt-12", className)}>{children}</section>;
}
