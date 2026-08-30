/**
 * Durations, named once.
 *
 * Cache lifetimes, retry ladders and date arithmetic all reach for the same
 * handful of magnitudes, and `24 * 60 * 60 * 1000` written out at each site is a
 * number nobody rereads carefully enough to catch a missing zero in.
 */

export const MS_PER_SECOND = 1_000;
export const MS_PER_MINUTE = 60 * MS_PER_SECOND;
export const MS_PER_HOUR = 60 * MS_PER_MINUTE;
export const MS_PER_DAY = 24 * MS_PER_HOUR;

/**
 * Nights between two ISO dates, or null when there is not a usable pair.
 *
 * Here rather than beside either caller because both of them price a stay, and a
 * stay length is the one figure a model should never be asked for: it is implied
 * exactly by the two dates it is sent with. Asked for it separately, a planning
 * turn simply left it out, and the lodging total — computed as rate times nights
 * whenever the provider quotes no total of its own — silently became nothing at
 * all, in the sum whose whole job is to say what a trip costs.
 */
export function nightsBetween(start?: string, end?: string): number | null {
  if (!start || !end) return null;

  const from = Date.parse(start);
  const to = Date.parse(end);
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return null;

  return Math.round((to - from) / MS_PER_DAY) || null;
}

/** Google Flights reports a journey in minutes, and nobody reads one that way. */
export const MINUTES_PER_HOUR = 60;

export const SECONDS_PER_MINUTE = 60;
export const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE;
export const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;
export const SECONDS_PER_YEAR = 365 * SECONDS_PER_DAY;
