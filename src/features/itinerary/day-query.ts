import { MAX_LOOKUP_QUERY_LENGTH } from '@/features/photos/shared';

/**
 * Turning a day heading into something worth searching for a photograph.
 *
 * The model writes headings for a reader — "Day 3: Fairytale Heritage in Sintra" —
 * and almost every word in that is atmosphere. Handed to an image search
 * unedited it resolves to an article about heritage, or about the number three.
 */

/** Stripped: a day number and whatever separator follows it. */
const DAY_PREFIX = /^day\s*\d+\s*[:–—-]?\s*/i;

/** Filler that would drag the image search away from the actual place. */
const TITLE_NOISE =
  /\b(welcome to|arrival in|arrival|departure|farewell|morning|afternoon|evening|day trip to|day trip|exploring|explore|discovering|discover|highlights|hidden|historic|traditions?|heritage|and beyond|in|the|of|a)\b/gi;

/** Punctuation that reads as a list separator rather than as part of a name. */
const SEPARATORS = /[&/|,]/g;

/** Below this there is no subject left, only fragments of one. */
const MIN_SUBJECT_LENGTH = 3;

/**
 * A searchable place from a day heading, or null when nothing useful is left.
 *
 * The destination is appended because a stripped heading is often a bare
 * neighbourhood, and a bare neighbourhood is ambiguous across cities.
 */
export function dayImageQuery(title: string, destination: string): string | null {
  const withoutDayNumber = title.replace(DAY_PREFIX, '').trim();
  if (withoutDayNumber.length < MIN_SUBJECT_LENGTH) return null;

  const cleaned = withoutDayNumber
    .replace(TITLE_NOISE, ' ')
    .replace(SEPARATORS, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Falls back to the uncleaned heading when the filter took everything: a
  // heading made entirely of stop words is still a better query than nothing.
  const subject = cleaned.length >= MIN_SUBJECT_LENGTH ? cleaned : withoutDayNumber;

  return `${subject} ${destination}`.trim().slice(0, MAX_LOOKUP_QUERY_LENGTH);
}
