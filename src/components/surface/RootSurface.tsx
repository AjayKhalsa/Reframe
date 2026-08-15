"use client";

import { useEffect } from "react";

import { useTheme } from "@/components/theme/ThemeProvider";
import { PAPER } from "@/lib/palette/generate";
import type { SurfaceKind } from "./Surface";

/**
 * Declares the surface of the document root.
 *
 * A page-level `<Surface>` paints only its own box; the root still shows
 * through in the overscroll gutter and behind the browser chrome. On a movie
 * detail page that means rubber-banding a dark plate reveals a strip of paper
 * underneath, which instantly breaks the illusion.
 *
 * Renderless, so a server-rendered page can set this without becoming a client
 * component itself.
 */
export function RootSurface({ kind }: { kind: SurfaceKind }) {
  const { palette } = useTheme();

  useEffect(() => {
    const root = document.documentElement;
    const previous = root.dataset.surface;
    root.dataset.surface = kind;

    return () => {
      // Hand the root back on navigation rather than leaving the last page's
      // surface stuck on the document.
      if (previous) root.dataset.surface = previous;
      else delete root.dataset.surface;
    };
  }, [kind]);

  // Mobile browser chrome should match the page it is framing, or a dark plate
  // ends up sitting under a stark white status bar.
  useEffect(() => {
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", kind === "plate" ? palette.background : PAPER);
  }, [kind, palette.background]);

  return null;
}
