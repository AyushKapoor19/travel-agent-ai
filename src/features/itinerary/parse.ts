/**
 * Reading the agent's markdown as a plan rather than as prose.
 *
 * Everything here runs on partial text while the reply is still streaming, which is
 * the constraint that shapes it: the last section is usually incomplete and that is
 * fine, because the section it fills simply grows as tokens arrive.
 */

/** A day heading anywhere in the text — the marker that a reply is a plan. */
const DAY_HEADING = /^#{2,3}\s+day\s+/im;

/** Any section heading the agent writes, at either level it uses. */
const HEADING_LINE = /^#{2,3}\s+(.+)$/;

/**
 * A day heading, split into its number and whatever the day is actually called.
 *
 * Both halves are wanted separately because the document draws them separately: the
 * number hangs in the margin as a figure and the name is set as the heading. Printed
 * together they were printed twice — "01  Day 1: Arrival in Asakusa".
 */
const DAY_TITLE = /^day\s*(\d+)\b\s*[:–—-]?\s*(.*)$/i;

export type ItineraryDay = {
  /** As written in the heading, so a plan that starts at Day 0 is not renumbered. */
  number: string | null;
  /** The day's name with the number taken off, e.g. "Arrival in Asakusa". */
  title: string;
  body: string;
};

export type ItinerarySection = {
  title: string;
  body: string;
};

export type SplitItinerary = {
  /** Everything before the first heading. */
  intro: string;
  days: ItineraryDay[];
  /**
   * Sections after the days that are not days — in practice the "Good to know" the
   * planning prompt asks for.
   *
   * They used to have nowhere to go. The split only recognised day headings, so a
   * section about tipping and closing days landed in the body of the last day and was
   * drawn inside it: a heading nested in the prose of Day 7, which read as something
   * that happened on Day 7.
   */
  notes: ItinerarySection[];
};

/**
 * Whether a message's text is a day-by-day plan. Content-based rather than turn-based,
 * so an earlier itinerary keeps its treatment after the traveller asks a follow-up.
 */
export function looksLikeItinerary(text: string): boolean {
  return DAY_HEADING.test(text);
}

type OpenSection = {
  /** The heading as written, which is the title of a note. */
  heading: string;
  /** Null for a note, which is any section after the days that is not one. */
  day: { number: string | null; title: string } | null;
  lines: string[];
};

function headingOf(line: string): string | null {
  return HEADING_LINE.exec(line.trim())?.[1]?.trim() ?? null;
}

function dayOf(heading: string): { number: string | null; title: string } | null {
  const match = DAY_TITLE.exec(heading);
  if (!match) return null;

  const number = match[1] ?? null;
  const title = (match[2] ?? '').trim();

  // A heading that is only "Day 4" still needs something to be called.
  return { number, title: title || heading };
}

/**
 * Splits the agent's markdown into the paragraph that opens it, one section per day,
 * and whatever it closes with.
 *
 * A heading arriving before any day is left in the intro rather than opening a section
 * of its own. The planning prompt asks for the opening lines to carry no heading, and a
 * model that writes one anyway has written a title for the trip — which belongs above
 * the days, not beside them.
 */
export function splitItinerary(markdown: string): SplitItinerary {
  const intro: string[] = [];
  const sections: OpenSection[] = [];
  let current: OpenSection | null = null;

  for (const line of markdown.split('\n')) {
    const heading = headingOf(line);

    if (heading) {
      const day = dayOf(heading);

      // Before the first day there is nothing for a note to be a note of.
      if (!day && sections.length === 0) {
        intro.push(line);
        continue;
      }

      current = { heading, day, lines: [] };
      sections.push(current);
      continue;
    }

    if (current) current.lines.push(line);
    else intro.push(line);
  }

  const days: ItineraryDay[] = [];
  const notes: ItinerarySection[] = [];

  for (const section of sections) {
    const body = section.lines.join('\n').trim();

    if (section.day) days.push({ ...section.day, body });
    else notes.push({ title: section.heading, body });
  }

  return { intro: intro.join('\n').trim(), days, notes };
}
