'use client';

import { useMemo } from 'react';

import type { PlaceImage } from '@/features/photos/shared';
import { usePlaceImages } from '@/features/photos/use-place-image';
import { useSettledValue } from '@/lib/use-settled-value';

import { dayImageQuery } from './day-query';
import type { ItineraryDay } from './parse';

/**
 * How long the set of day headings must stop changing before it is worth a lookup.
 *
 * Headings arrive a token at a time while the itinerary streams, so querying on
 * every render would fire a request per character. Only the headings are in the
 * key, not the bodies — so the batch goes out shortly after a heading lands
 * rather than waiting for the whole plan to finish writing.
 */
const HEADING_SETTLE_MS = 900;

/** Joined into one key, so the settle watches the plan rather than each heading. */
const QUERY_SEPARATOR = '\n';

function dayQueries(days: readonly ItineraryDay[], destination: string): (string | null)[] {
  if (!destination) return days.map(() => null);
  return days.map((day) => dayImageQuery(day.title, destination));
}

/**
 * A photograph for each day of the plan, in one request rather than one each.
 *
 * This used to live in `DaySection`, which meant a seven-day plan opened eight
 * lookups at once — seven days and the cover — and that is the single reason
 * the back half of an itinerary came up without photographs. Each of those
 * requests paid for its own search *and* its own licence call, and the pacing
 * that keeps us inside Wikipedia's rate limit is process-wide, so they simply
 * queued up behind one another until the limit refused the tail of the set.
 *
 * Batched, the same plan spends one search per day and one licence call for all
 * of them. The lookup route and its client were built for exactly this; the
 * itinerary was the one surface that never used it.
 *
 * The set grows as the plan streams, so this does re-request as each heading
 * lands. That is cheap on purpose: the server remembers which photograph
 * belongs to a place, so every query but the newest is answered without
 * touching Wikipedia at all.
 *
 * @returns One entry per day, positionally aligned with `days`.
 */
export function useDayImages(
  days: readonly ItineraryDay[],
  destination: string,
): (PlaceImage | null)[] {
  const queries = dayQueries(days, destination);

  const settledKey = useSettledValue(queries.join(QUERY_SEPARATOR), HEADING_SETTLE_MS);

  const settledQueries = useMemo(
    () => (settledKey ? settledKey.split(QUERY_SEPARATOR).filter(Boolean) : []),
    [settledKey],
  );

  const images = usePlaceImages(settledQueries);

  return queries.map((query) => (query ? (images[query] ?? null) : null));
}
