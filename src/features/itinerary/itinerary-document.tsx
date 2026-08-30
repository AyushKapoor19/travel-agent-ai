'use client';

import { Markdown } from '@/components/ui/markdown';
import { RouteWait } from '@/components/ui/route-wait';
import { textFromParts } from '@/features/agent/message-text';
import type { WayfareMessagePart } from '@/features/agent/messages';
import { isBandTitle } from '@/features/conversation/cards/band-titles';
import { ToolResult } from '@/features/conversation/tool-results';
import type { TripBrief } from '@/features/trip/brief';

import { planBands } from './bands';
import { DaySection } from './day-section';
import { splitItinerary } from './parse';
import { TripMasthead } from './trip-masthead';

type ItineraryDocumentProps = {
  brief: TripBrief;
  /** The plan's parts: the prose and the tool calls behind it. Empty before it starts. */
  parts: readonly WayfareMessagePart[];
  /** The plan is still being written, which is what the closing wait is for. */
  writing: boolean;
};

/**
 * The payoff, drawn as a printed itinerary.
 *
 * Bands, in the order they are read and the order they arrive: the trip itself, the
 * paragraph explaining its shape, then each thing that was found or priced, then the
 * days. Every band is introduced the same way — a tracked label with a hairline running
 * out to the end of the measure — and that is the whole of the structure. There is no
 * card, no panel and no timeline spine, because the plan is one document rather than a
 * feed of thirteen objects.
 *
 * The tool bands are laid out flat rather than gathered under a heading of their own.
 * "What I found" over a band already labelled "Where to stay" was a label announcing a
 * label, and the nesting it implied did not exist: a fare and a total are sections of
 * the plan in exactly the way the days are.
 *
 * The order is also the streaming order, and that is not a coincidence: the tools run
 * before a word is written, so a reader watching this build sees the trip, then its
 * shape, then the evidence, then the days. Putting the days above the evidence would
 * read better on a finished page and would mean twenty seconds of watching a gap where
 * the days will be.
 */
export function ItineraryDocument({ brief, parts, writing }: ItineraryDocumentProps) {
  const { intro, days, notes } = splitItinerary(textFromParts(parts));

  return (
    <article className="space-y-12">
      <TripMasthead brief={brief} />

      {intro && <Markdown content={intro} variant="lede" />}

      {planBands(parts).map((part) => (
        <ToolResult key={part.toolCallId} part={part} />
      ))}

      {days.length > 0 && (
        <section className="space-y-6">
          <h2 className="section-rule text-ink-soft">Day by day</h2>

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
                destination={brief.destination}
              />
            ))}
          </div>
        </section>
      )}

      {notes.map((note) => (
        <section key={note.title} className="space-y-5">
          {/* Dropped when a band above already carries this heading. The paragraph
              under it is worth keeping — why that stay suits this trip — and only the
              second copy of the heading is wrong. */}
          {!isBandTitle(note.title) && <h2 className="section-rule text-ink-soft">{note.title}</h2>}
          <Markdown content={note.body} />
        </section>
      ))}

      {writing && <RouteWait label={days.length > 0 ? 'Still writing' : 'Building your trip'} />}
    </article>
  );
}
