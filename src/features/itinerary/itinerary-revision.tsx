'use client';

import { Markdown } from '@/components/ui/markdown';
import { isBandTitle } from '@/features/conversation/cards/band-titles';

import { DaySection } from './day-section';
import { splitItinerary } from './parse';
import { useDayImages } from './use-day-images';

type ItineraryRevisionProps = {
  /** The reply's prose, which has at least one day heading in it. */
  text: string;
  /** Scopes each day's photo lookup, so "Old town" resolves to the right city. */
  destination: string;
};

/**
 * A change to the plan, set below it in the plan's own hand.
 *
 * The document above is the trip as it was delivered and it stays that way, so a day
 * they have moved has to be readable as a day rather than as a paragraph about one —
 * same numeral in the margin, same rule, same plate. Drawn with the document's own
 * sections for exactly that reason: a rewritten Thursday that renders as chat is a
 * different kind of thing from the Thursday it replaces, and the traveller has to hold
 * the difference in their head to read it.
 *
 * No "Day by day" heading over it, unlike the document. This is one or two days most of
 * the time, and a heading announcing a plan over a single revised day claims more than
 * arrived; the line the agent writes above them already says what moved.
 */
export function ItineraryRevision({ text, destination }: ItineraryRevisionProps) {
  const { intro, days, notes } = splitItinerary(text);
  const dayImages = useDayImages(days, destination);

  return (
    <div className="space-y-7">
      {intro && <Markdown content={intro} />}

      {days.length > 0 && (
        <div className="space-y-8">
          {days.map((day, index) => (
            // Keyed by position, not title: the heading is still streaming in and a
            // changing key would remount the section on every token.
            <DaySection
              key={index}
              number={day.number}
              title={day.title}
              body={day.body}
              index={index}
              image={dayImages[index] ?? null}
            />
          ))}
        </div>
      )}

      {notes.map((note) => (
        <section key={note.title} className="space-y-4">
          {!isBandTitle(note.title) && <h3 className="section-rule text-ink-soft">{note.title}</h3>}
          <Markdown content={note.body} />
        </section>
      ))}
    </div>
  );
}
