import { cn } from "@/lib/cn";

export type SurfaceKind = "paper" | "plate";

/**
 * A region printed on paper or on a dark plate.
 *
 * The whole design system hangs off this one attribute. Both surfaces define
 * the same token names (see globals.css), so anything inside — `Poster`,
 * `MovieCard`, `Section`, buttons — adapts without knowing which surface it is
 * on. A plate additionally picks up the current film's colours; paper never
 * does, beyond a single re-derived accent.
 *
 * `isolate` matters: plates contain a backdrop positioned behind their content,
 * and without a stacking context of their own that backdrop would escape and
 * sit behind the page instead of behind the plate.
 */
export function Surface({
  kind,
  as: Tag = "div",
  className,
  children,
}: {
  kind: SurfaceKind;
  as?: "div" | "section" | "main" | "article" | "header";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Tag data-surface={kind} className={cn("relative isolate", className)}>
      {children}
    </Tag>
  );
}
