"use client";

import Link from "next/link";

import { Section, SectionHeading } from "@/components/ui/Section";
import { posterUrl } from "@/lib/tmdb/images";
import { useUniverse } from "./UniverseProvider";

/**
 * A film's neighbourhood, on its own page.
 *
 * These come from the precomputed nearest neighbours in the embedding space —
 * not from shared genres, and not from where films happened to land in the 3D
 * projection. The projection is a picture of the space; this is the space.
 *
 * No similarity percentages. The brief is right that scattering "88% similar"
 * across the page makes the product read as an algorithm demo, and the honest
 * signal — these are the closest films we know of — is already carried by the
 * heading and the order.
 */
export function NearbyFilms({ tmdbId }: { tmdbId: number }) {
  const { byId, flyTo } = useUniverse();
  const node = byId.get(tmdbId);

  if (!node || node.n.length === 0) return null;

  return (
    <Section>
      <SectionHeading eyebrow="Nearby in the universe" title="Closest films" />

      <ul className="rail">
        {node.n.slice(0, 10).map((id) => {
          const neighbour = byId.get(id);
          if (!neighbour) return null;

          return (
            <li key={id} className="w-[7.5rem]">
              <Link href={`/movie/${id}`} className="group block">
                <div
                  className="bg-surface overflow-hidden transition-transform duration-300 group-hover:-translate-y-1"
                  style={{ aspectRatio: "2 / 3", borderRadius: "var(--radius-poster)" }}
                >
                  {posterUrl(neighbour.p, "w342") && (
                    <img
                      src={posterUrl(neighbour.p, "w342") as string}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <p className="text-ink mt-2 truncate text-[0.8125rem]">{neighbour.t}</p>
                <p className="meta">{neighbour.y ?? ""}</p>
              </Link>

              <button
                type="button"
                onClick={() => flyTo(id)}
                className="text-muted hover:text-accent mt-1 text-[0.625rem] tracking-[0.12em] uppercase transition-colors"
              >
                Show on map
              </button>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
