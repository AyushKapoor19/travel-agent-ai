import { describe, expect, it } from 'vitest';

import { looksLikeItinerary, splitItinerary } from './parse';

/**
 * Reading a streamed reply as a document.
 *
 * Every case here is a partial document at some point, because the reply arrives a
 * token at a time and this runs on every one of them. A split that is only correct on
 * finished text would be correct for the last frame of a twenty-second reveal.
 */

const PLAN = `Seven days built around the food, and paced so nothing is rushed.

## Day 1: Arrival in Asakusa

Land, drop the bags, walk to Senso-ji.

## Day 2: Meiji and Harajuku

Start at the shrine.

## Good to know

Tipping is not expected anywhere.`;

describe('looksLikeItinerary', () => {
  it('recognises a plan by its day headings', () => {
    expect(looksLikeItinerary(PLAN)).toBe(true);
  });

  it('does not mistake an answer for a plan', () => {
    expect(looksLikeItinerary('Tuesday works — the museum is open.')).toBe(false);
  });

  /** The reveal has to begin on the first heading, not on a finished document. */
  it('recognises a plan from a partial first heading line', () => {
    expect(looksLikeItinerary('Seven days.\n\n## Day 1: Arri')).toBe(true);
  });
});

describe('splitItinerary', () => {
  it('keeps everything before the first heading as the opening', () => {
    expect(splitItinerary(PLAN).intro).toBe(
      'Seven days built around the food, and paced so nothing is rushed.',
    );
  });

  it('takes the number and the name of each day apart', () => {
    expect(splitItinerary(PLAN).days).toEqual([
      { number: '1', title: 'Arrival in Asakusa', body: 'Land, drop the bags, walk to Senso-ji.' },
      { number: '2', title: 'Meiji and Harajuku', body: 'Start at the shrine.' },
    ]);
  });

  /**
   * The section this split was extended for. It used to land in the body of the last
   * day and be drawn inside it, which read as advice about Day 7.
   */
  it('keeps a closing section out of the last day', () => {
    const { days, notes } = splitItinerary(PLAN);

    expect(days[1]?.body).toBe('Start at the shrine.');
    expect(notes).toEqual([{ title: 'Good to know', body: 'Tipping is not expected anywhere.' }]);
  });

  it('names a day that has only a number', () => {
    expect(splitItinerary('## Day 4\n\nA quiet one.').days).toEqual([
      { number: '4', title: 'Day 4', body: 'A quiet one.' },
    ]);
  });

  it('reads a day heading at either level the agent writes', () => {
    expect(splitItinerary('### Day 2: Sintra\n\nGo early.').days).toHaveLength(1);
  });

  /**
   * A heading before any day is a title for the trip rather than a section of it, so it
   * stays with the opening instead of becoming a note about nothing.
   */
  it('leaves a heading written before the first day in the opening', () => {
    const { intro, days, notes } = splitItinerary(
      '## Your week\n\nSeven days.\n\n## Day 1: Go\n\nx',
    );

    expect(intro).toBe('## Your week\n\nSeven days.');
    expect(days).toHaveLength(1);
    expect(notes).toEqual([]);
  });

  it('returns an empty split for prose with no headings', () => {
    expect(splitItinerary('Just a sentence.')).toEqual({
      intro: 'Just a sentence.',
      days: [],
      notes: [],
    });
  });

  /** Mid-stream, a day exists before it has a body. The section simply grows. */
  it('opens a day with an empty body while its first line is still arriving', () => {
    expect(splitItinerary('Intro.\n\n## Day 1: Asakusa').days).toEqual([
      { number: '1', title: 'Asakusa', body: '' },
    ]);
  });
});
