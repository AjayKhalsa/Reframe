import type { Metadata } from "next";

import { Measure } from "@/components/chrome/AppShell";
import { Section, SectionHeading } from "@/components/ui/Section";

export const metadata: Metadata = {
  title: "Groups · Reframe",
};

const PLANNED = [
  {
    title: "Taste compatibility",
    body: "What you both love, where you diverge, and the films that sit in the overlap — more useful than a single percentage.",
  },
  {
    title: "Movie night rooms",
    body: "Invite by link or code. Everyone's profile joins the same ranking, and one film comes out the other end.",
  },
  {
    title: "Consensus over average",
    body: "A film one person actively dislikes is penalised, not averaged away. Nobody should lose movie night quietly.",
  },
  {
    title: "Voting, when nobody trusts the algorithm",
    body: "Yes / maybe / no from each person, resolved into the best available agreement.",
  },
];

/**
 * Groups.
 *
 * Social is Phase 7, and the honest thing is to say so rather than ship a
 * screen of invented friends. It still gets designed properly — a nav
 * destination that looks unfinished undermines the four that aren't.
 */
export default function GroupsPage() {
  return (
    <Measure>
      <header className="pt-8 md:pt-12">
        <span className="eyebrow">Groups</span>
        <h1 className="font-display text-ink mt-3 max-w-xl text-[2rem] text-balance sm:text-[2.75rem]">
          Deciding alone is hard enough. Deciding together is the real problem.
        </h1>
        <p className="text-muted mt-5 max-w-md text-sm leading-relaxed">
          The app works completely on its own — social is a layer on top, not the
          point. It arrives in Phase 7, once the engine underneath is worth pooling.
        </p>
      </header>

      <Section>
        <SectionHeading eyebrow="What lands here" />
        <ul className="grid gap-px sm:grid-cols-2" style={{ background: "var(--hairline)" }}>
          {PLANNED.map((item) => (
            <li key={item.title} className="bg-bg p-6">
              <h3 className="font-display text-ink text-[1.375rem]">{item.title}</h3>
              <p className="text-muted mt-2.5 text-sm leading-relaxed text-pretty">
                {item.body}
              </p>
            </li>
          ))}
        </ul>
      </Section>
    </Measure>
  );
}

