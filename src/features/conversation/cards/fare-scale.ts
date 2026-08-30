import type { FareInsight } from '@/features/travel/types';

/**
 * Where a set of fares sits against the range Google says the route usually runs in.
 *
 * The band's sentence already says "high for the route", and a reader who has been
 * quoted one number has no feel for how far off "high" is. Placed on a scale, the gap
 * between what the route usually costs and what is actually on offer is legible before
 * the sentence is read.
 *
 * Kept apart from the card because it is the only arithmetic in the band, and the cases
 * that break it are the quiet ones: a route with no typical range, fares that all cost
 * the same, a band with no width. Each of those wants a test rather than a squint at a
 * screenshot.
 */

/** Breathing room at each end, as a share of what the scale spans. */
const PAD = 0.1;

export type FareScale = {
  /** The range the route usually runs in, as percentages across the scale. */
  band: { left: number; width: number };
  /** Where each fare falls, in the order the fares were given. */
  marks: number[];
};

/**
 * Null unless Google gave both ends of the band and there is a spread to draw. A mark
 * with nothing to be measured against is a dot on a line, and a scale spanning one
 * price puts everything on top of everything else.
 */
export function fareScale(
  prices: readonly number[],
  insight: FareInsight | null,
): FareScale | null {
  const low = insight?.typicalLowUsd ?? null;
  const high = insight?.typicalHighUsd ?? null;
  if (low === null || high === null || prices.length === 0) return null;

  // The scale holds both the band and the fares, because the case worth drawing is
  // fares that sit outside what the route usually costs.
  const start = Math.min(low, ...prices);
  const end = Math.max(high, ...prices);
  if (end <= start) return null;

  const pad = (end - start) * PAD;
  const from = start - pad;
  const to = end + pad;
  const at = (price: number) => ((price - from) / (to - from)) * 100;

  return {
    band: { left: at(low), width: at(high) - at(low) },
    marks: prices.map(at),
  };
}
