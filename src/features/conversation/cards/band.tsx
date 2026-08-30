import type { ReactNode } from 'react';

type BandProps = {
  /** The label, e.g. "Where to stay". Set as a rule that runs out to the measure. */
  title: string;
  children: ReactNode;
};

/**
 * One band of the plan: a labelled rule with whatever a tool returned under it.
 *
 * Every tool result gets the same introduction, and that is the point. Stays came
 * back as a titled grid, a fare and a total as untitled panels, and the climate as
 * neither — five results, four different ways of announcing themselves, which is
 * what a stack of chat widgets looks like. One band means the document has one
 * structure and a reader learns it once.
 */
export function Band({ title, children }: BandProps) {
  return (
    <section className="space-y-5">
      <h3 className="section-rule text-ink-soft">{title}</h3>
      {children}
    </section>
  );
}

/**
 * What a provider could not tell us.
 *
 * Deliberately the quietest thing on the page. These are absences, and an absence
 * drawn as a card is a result that says nothing — the worst trade in the document,
 * because it takes a card's worth of attention to deliver no information.
 */
export function AsideNote({ children }: { children: ReactNode }) {
  return <p className="aside-note">{children}</p>;
}
