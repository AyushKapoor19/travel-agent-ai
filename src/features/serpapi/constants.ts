import { MS_PER_MINUTE, MS_PER_SECOND } from '@/lib/time';

/**
 * Every tunable for the search-vendor transport, with the reasoning attached.
 *
 * Collected here rather than beside the code that reads them because they are one
 * negotiated position against a single finite allowance — SerpApi's free plan is
 * 250 searches a month, Scrapingdog's is forty — and the pacing, the retry count
 * and both cache lifetimes are all arguments about how to spend it.
 *
 * Which vendor answers, and everything that differs between them, lives in
 * `vendors.ts`. These numbers hold either way.
 */

/**
 * The four Google surfaces this app reads, named once.
 *
 * Two of them back one feature between them: `LOCAL` knows what a place *is* and
 * reports no price for attractions, while the top-sights block carried by `GOOGLE`
 * has the entry price and puts opening hours where the description belongs.
 */
export const SerpApiEngine = {
  GOOGLE: 'google',
  LOCAL: 'google_local',
  HOTELS: 'google_hotels',
  FLIGHTS: 'google_flights',
} as const;

export type SerpApiEngineName = (typeof SerpApiEngine)[keyof typeof SerpApiEngine];

/* -------------------------------------------------------------------------- */
/* Talking to the API                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Generous, because SerpApi is itself waiting on Google. A hotel search for a
 * busy city regularly takes several seconds, and giving up on one costs a real
 * search off the allowance for nothing.
 */
export const API_TIMEOUT_MS = 10 * MS_PER_SECOND;

/**
 * Low on purpose. Unlike a rate limit, most failures here have already been paid
 * for, so a retry is a second search against the plan rather than a free wait.
 */
export const API_RETRIES = 2;
export const API_BACKOFF_BASE_MS = 500;
export const API_BACKOFF_MAX_MS = 4 * MS_PER_SECOND;

/**
 * A gap between the *starts* of outbound calls, process-wide.
 *
 * Deliberately weaker than the mutex the climate transport needs: SerpApi holds no
 * per-IP slot, so calls may overlap and a planning turn's searches are not forced
 * into single file. This only keeps a burst from arriving as one spike.
 */
export const MIN_REQUEST_GAP_MS = 150;

/* -------------------------------------------------------------------------- */
/* Caching                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * An hour, which is not an arbitrary round number: it is SerpApi's own cache
 * window. An identical query inside it is served free and does not count against
 * the plan, so `no_cache` is never sent and holding results for the same hour
 * means a repeated search costs nothing either way.
 */
export const RESPONSE_TTL_MS = 60 * MS_PER_MINUTE;

/**
 * Misses are cached too, briefly. Without this a destination Google has nothing
 * for is re-searched on every turn of the conversation, and each attempt is billed.
 */
export const RESPONSE_MISS_TTL_MS = 2 * MS_PER_MINUTE;

/** Entries held per cache. Each is a parsed result list, so this is kilobytes. */
export const RESPONSE_CACHE_MAX = 128;
