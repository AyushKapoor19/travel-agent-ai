/**
 * Calendar months, named once.
 *
 * Domain-free on purpose: a climate table, a "best time to go" line and a
 * resolved trip date all need to agree on what month index 4 means, and they sit
 * in three different features. Zero-based throughout, matching `Date`, because
 * one module counting from one is how a May recommendation comes back about June.
 */

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export const MONTHS_PER_YEAR = MONTH_NAMES.length;

/** Wraps any integer into 0..11, so December + 1 is January rather than absent. */
export function normalizeMonthIndex(index: number): number {
  return ((index % MONTHS_PER_YEAR) + MONTHS_PER_YEAR) % MONTHS_PER_YEAR;
}

/** The month's name, for prose and for a card's weather line. */
export function monthName(index: number): string {
  return MONTH_NAMES[normalizeMonthIndex(index)] as string;
}

/**
 * The month a date falls in, from a resolved `YYYY-MM-DD`, as a 0-based index.
 *
 * Null rather than a guess when the date is absent or unparseable: a
 * recommendation that silently ranked everywhere against January would be worse
 * than one that admits it does not know when you are going.
 */
export function monthIndexFrom(isoDate: string): number | null {
  const parsed = Date.parse(isoDate);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).getUTCMonth();
}

/** True when the two months are adjacent, December and January included. */
export function monthsAdjacent(a: number, b: number): boolean {
  const gap = Math.abs(normalizeMonthIndex(a) - normalizeMonthIndex(b));
  return Math.min(gap, MONTHS_PER_YEAR - gap) === 1;
}
