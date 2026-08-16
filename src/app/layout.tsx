import type { Metadata, Viewport } from "next";
import { DM_Serif_Display, Inter } from "next/font/google";

import { UniverseCanvas } from "@/components/universe/UniverseCanvas";
import { UniverseProvider } from "@/components/universe/UniverseProvider";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { readUniverse } from "@/lib/universe/data";
import "./globals.css";

/** Editorial voice: film titles, section openers. */
const display = DM_Serif_Display({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

/** Everything the interface says in its own voice. */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Reframe — A spatial map of cinema",
  description: "A spatial map of cinema where similar films live near each other.",
  applicationName: "Reframe",
  openGraph: {
    title: "Reframe",
    description: "A spatial map of cinema where similar films live near each other.",
    siteName: "Reframe",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#08080a",
  viewportFit: "cover",
  maximumScale: 5,
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Loaded here rather than per-page so the universe is available to every
  // route — a film's page needs the neighbour graph too.
  const universe = await readUniverse();

  return (
    <html
      lang="en"
      data-surface="void"
      className={`${display.variable} ${inter.variable} h-full`}
    >
      <body className="grain min-h-full">
        <ThemeProvider>
          <UniverseProvider universe={universe}>
            <UniverseCanvas />
            {/* Everything routed sits above the canvas. */}
            <div className="relative z-10">{children}</div>
          </UniverseProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
