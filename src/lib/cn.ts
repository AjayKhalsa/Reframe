/**
 * Conditional className joiner.
 *
 * Deliberately not tailwind-merge: nothing here relies on later classes
 * overriding earlier ones, and a 4kb dependency to avoid that discipline isn't
 * worth it.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
