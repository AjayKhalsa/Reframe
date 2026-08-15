"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import type { Palette } from "@/lib/types";
import { DEFAULT_PALETTE, paletteToCssVars } from "@/lib/palette/generate";

type ThemeContextValue = {
  palette: Palette;
  /** Applies a film's palette. Passing `null` returns to the resting theme. */
  setPalette: (palette: Palette | null) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Owns the document-level palette.
 *
 * Variables are written to `documentElement` rather than a wrapper so the theme
 * reaches everything — body background, scrollbars, overscroll gutter — without
 * every surface having to opt in. The transition itself is pure CSS (see the
 * `@property` block in globals.css); this component only swaps the values.
 */
export function ThemeProvider({
  children,
  initialPalette,
}: {
  children: React.ReactNode;
  initialPalette?: Palette | null;
}) {
  const [palette, setPaletteState] = useState<Palette>(initialPalette ?? DEFAULT_PALETTE);

  const setPalette = useCallback((next: Palette | null) => {
    setPaletteState(next ?? DEFAULT_PALETTE);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    // Only the --film-* namespace is written. Which of those values actually
    // reach the screen is decided by the surface tokens in globals.css: a
    // plate consumes all of them, paper consumes only the light-safe accent.
    // That indirection is what keeps the film's colour off the editorial pages.
    for (const [name, value] of Object.entries(paletteToCssVars(palette))) {
      root.style.setProperty(name, value);
    }
  }, [palette]);

  const value = useMemo(() => ({ palette, setPalette }), [palette, setPalette]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside <ThemeProvider>");
  return context;
}

/**
 * Themes the app from a film for as long as the calling component is mounted,
 * then hands the theme back.
 *
 * The restore-on-unmount is what makes navigation feel coherent: leaving a
 * film's detail page returns you to the app's own colours instead of stranding
 * you in the last film you happened to look at.
 */
export function useFilmTheme(palette: Palette | null | undefined) {
  const { setPalette } = useTheme();

  // Serialised so a fresh object with identical values doesn't re-fire the
  // effect — palettes routinely arrive as new object literals from props.
  // Parsing the key back inside the effect avoids depending on the object
  // identity at all, so there is no ref to read during render.
  const key = palette ? JSON.stringify(palette) : null;

  useEffect(() => {
    if (!key) return;
    setPalette(JSON.parse(key) as Palette);
    return () => setPalette(null);
  }, [key, setPalette]);
}
