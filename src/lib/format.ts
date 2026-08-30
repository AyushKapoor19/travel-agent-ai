/**
 * How numbers are written on a card.
 *
 * Every one of these appeared inline in a component at least twice, which is how
 * a rating ends up with one decimal place in one card and two in the next. The
 * rule for each lives here, and the cards ask for a string.
 */

const DISPLAY_LOCALE = 'en-US';

const STAR = '★';

/**
 * Money, rounded to the unit. Null in, null out, so a card can decide not to
 * show a price row rather than showing an empty one.
 *
 * Falls back to a plain "EUR 165" when `Intl` rejects the currency code: a
 * provider we have not integrated yet is a more likely source of a bad code
 * than a bug here, and refusing to render the price at all would be worse.
 */
export function formatPrice(price: number | null, currency: string): string | null {
  if (price === null) return null;

  try {
    return new Intl.NumberFormat(DISPLAY_LOCALE, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(price);
  } catch {
    return `${currency} ${Math.round(price)}`;
  }
}

/** One decimal, always, so 9 and 9.1 line up in a column of ratings. */
export function formatRating(rating: number): string {
  return rating.toFixed(1);
}

export function formatStars(stars: number): string {
  return STAR.repeat(Math.max(0, Math.round(stars)));
}

/** Grouped, because four figures unseparated reads as a price. */
export function formatCount(count: number): string {
  return count.toLocaleString(DISPLAY_LOCALE);
}

const ISO_DATE_LENGTH = 'YYYY-MM-DD'.length;

/**
 * A date as YYYY-MM-DD, which is the only date format the model is given or
 * asked for — anything else invites it to resolve "next Friday" against a
 * locale rather than against a day.
 */
export function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, ISO_DATE_LENGTH);
}

/** Today, for grounding the model's relative-date reasoning. */
export function todayIsoDate(): string {
  return formatIsoDate(new Date());
}

/**
 * An ISO day as a reader would write it: "Apr 8".
 *
 * Formatted in UTC, which is the only part of this worth stating. An ISO date
 * with no time parses as UTC midnight, and rendering that in a timezone behind
 * it prints the day before — so a trip starting on the 1st shows as departing on
 * the 31st for every reader west of Greenwich.
 */
function formatDay(iso: string, options: Intl.DateTimeFormatOptions): string | null {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return null;

  return new Intl.DateTimeFormat(DISPLAY_LOCALE, { ...options, timeZone: 'UTC' }).format(parsed);
}

/** One day, as a reader would write it: "Sep 10". Null when it will not parse. */
export function formatShortDate(iso: string): string | null {
  return formatDay(iso, { month: 'short', day: 'numeric' });
}

/**
 * A trip's window, as short as it can be said: "Apr 1–8", or "Apr 28 – May 3"
 * when it crosses a month.
 *
 * No year, deliberately. This is read in a stub field a dozen characters wide,
 * and every window this app can price is a near-term one inside three weeks — so
 * the year is the one part of the date nobody is reading it to find out, and it
 * costs the two figures that say which month.
 *
 * Null when either end is missing or unparseable, so a caller can fall back to
 * the traveller's own words rather than printing a broken range.
 */
export function formatDateRange(startIso: string, endIso: string): string | null {
  const start = formatDay(startIso, { month: 'short', day: 'numeric' });
  if (!start) return null;

  const end = formatDay(endIso, { month: 'short', day: 'numeric' });
  if (!end) return null;

  const sameMonth = startIso.slice(0, 'YYYY-MM'.length) === endIso.slice(0, 'YYYY-MM'.length);
  if (!sameMonth) return `${start} – ${end}`;

  // Within one month the month is said once and only the day changes, which is
  // how a date range is written everywhere outside a form.
  const endDay = formatDay(endIso, { day: 'numeric' });
  return endDay ? `${start}–${endDay}` : `${start} – ${end}`;
}
