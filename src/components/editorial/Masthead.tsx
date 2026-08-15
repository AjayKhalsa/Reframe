"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

import { cn } from "@/lib/cn";

/**
 * The masthead.
 *
 * A magazine names itself at the top of the page and lists its sections in
 * small type beside it — it does not put five glowing icons across the bottom
 * of every spread. Replacing the icon bar with this is most of what stops the
 * product reading as an app template.
 *
 * No hamburger either: four destinations fit on one line at every width, and a
 * menu that hides four links behind a tap is ceremony, not navigation.
 */

const SECTIONS = [
  { href: "/discover", label: "Discover" },
  { href: "/taste", label: "My cinema" },
  { href: "/profile", label: "Watchlist" },
  { href: "/search", label: "Search" },
] as const;

/** Nothing updates the date after mount, so the store never notifies. */
const subscribe = () => () => {};

const formatDate = () =>
  new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

export function Masthead() {
  const pathname = usePathname();
  const isActive = (href: string) => pathname.startsWith(href);

  // Rendered from the client's clock, not the server's. Same reasoning as
  // `Greeting`: an issue dated in another timezone is wrong, and
  // `useSyncExternalStore` expresses "these legitimately differ" without an
  // effect-driven setState or a hydration warning.
  const date = useSyncExternalStore(subscribe, formatDate, () => null);

  return (
    <header
      className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3 pt-6 pb-4"
      style={{ borderBottom: "1px solid var(--hairline)" }}
    >
      <div className="flex items-baseline gap-4">
        {/* The wordmark is the way back to the universe from anywhere. */}
        <Link
          href="/"
          className="font-display text-ink text-[1.375rem] leading-none tracking-[0.02em] uppercase"
        >
          Reframe
        </Link>
        {/* The date is doing real work: it is what makes the page feel like an
            issue rather than a screen. */}
        {date && <span className="meta hidden sm:inline">{date}</span>}
      </div>

      <nav aria-label="Sections">
        <ul className="flex items-baseline gap-5 sm:gap-7">
          {SECTIONS.map((section) => (
            <li key={section.href}>
              <Link
                href={section.href}
                aria-current={isActive(section.href) ? "page" : undefined}
                className={cn(
                  "text-[0.75rem] tracking-[0.1em] uppercase transition-colors duration-200",
                  isActive(section.href)
                    ? "text-ink"
                    : "text-muted hover:text-ink",
                )}
                style={
                  isActive(section.href)
                    ? { textDecoration: "underline", textUnderlineOffset: "5px" }
                    : undefined
                }
              >
                {section.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
