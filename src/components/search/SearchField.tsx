"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** Long enough that typing a title doesn't fire a request per keystroke. */
const DEBOUNCE_MS = 350;

/**
 * Search input.
 *
 * Drives the URL rather than local state, so results stay server-rendered and
 * a search is a real page you can link to or go back from. It is still a form,
 * so submitting from the keyboard works before the debounce has elapsed.
 */
export function SearchField({ initialQuery = "" }: { initialQuery?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);
  const latest = useRef(initialQuery);

  useEffect(() => {
    const trimmed = value.trim();
    if (trimmed === latest.current) return;

    const timer = setTimeout(() => {
      latest.current = trimmed;
      router.replace(trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : "/search");
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [value, router]);

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = value.trim();
        latest.current = trimmed;
        router.replace(trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : "/search");
      }}
    >
      <label className="sr-only" htmlFor="search-input">
        Search films
      </label>
      <input
        id="search-input"
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="A title, or something close to it"
        autoComplete="off"
        className="text-ink placeholder:text-muted w-full bg-transparent py-3 text-[1.125rem] outline-none"
        style={{ borderBottom: "1px solid var(--hairline-strong)" }}
      />
    </form>
  );
}
