import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      /**
       * We serve TMDB artwork straight from TMDB's CDN.
       *
       * TMDB publishes pre-sized derivatives (w154 … w1280) and their terms
       * expect you to use them. Routing that through next/image would add a
       * proxy hop and re-encode images that are already optimal, so every
       * `<img>` here is deliberate — we still set `srcset`, `sizes`, explicit
       * aspect ratios and lazy loading by hand. Turned off centrally rather
       * than suppressed at ~6 call sites.
       */
      "@next/next/no-img-element": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
