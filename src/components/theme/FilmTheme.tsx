"use client";

import { useFilmTheme } from "./ThemeProvider";
import type { Palette } from "@/lib/types";

/**
 * Applies a film's palette from a server component.
 *
 * Theming needs an effect, and effects need a client component — but making a
 * whole page client-side just to set five CSS variables would drag its data
 * fetching to the browser with it. Dropping this one renderless node into the
 * tree keeps the page on the server.
 */
export function FilmTheme({ palette }: { palette: Palette | null | undefined }) {
  useFilmTheme(palette);
  return null;
}
