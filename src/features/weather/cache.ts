import 'server-only';

import { NORMALS_CACHE_MAX, NORMALS_MISS_TTL_MS, NORMALS_TTL_MS } from './constants';
import { persistedNormals, persistNormals } from './normals-store';
import type { ClimateNormals } from './types';

/**
 * Which climate belongs to a place name, remembered per process and on disk.
 *
 * Worth more here than in the image pipeline: a normal is a hundred-kilobyte
 * download reduced to twelve rows, and it is the same twelve rows tomorrow. A
 * miss is cached too, but briefly, so a place that failed once gets another
 * chance within a couple of minutes while a genuinely unknown place stops being
 * looked up on every turn.
 *
 * "And on disk" is the part that was missing, and its absence was expensive
 * rather than merely suboptimal — see `normals-store.ts` for the day's API
 * allowance it cost. Only the successes are persisted: a miss is a two-minute
 * grace note, and writing one to disk would either say nothing or outlive its
 * meaning.
 *
 * Insertion-ordered eviction rather than true LRU. The access pattern is a
 * handful of places per conversation, so the two orders barely differ, and
 * `Map`'s ordering gives it away for free.
 */

type CacheEntry = { at: number; normals: ClimateNormals | null };

const entries = new Map<string, CacheEntry>();

/**
 * Case- and space-insensitive: "lisbon" and "Lisbon " are one place.
 *
 * The country is part of the key, not decoration. "San José, Costa Rica" and "San
 * Jose, United States" are the same name and very different weather, and a key
 * that ignored the qualifier would serve one as the other.
 */
export function climateKey(place: string, country?: string): string {
  return `${(country ?? '').trim().toLowerCase()}|${place.trim().toLowerCase()}`;
}

export function readNormals(place: string, country?: string): CacheEntry | null {
  const key = climateKey(place, country);
  const entry = entries.get(key);

  if (!entry) {
    // Nothing in memory, so fall through to what the last run left behind. The
    // stored copy carries no timestamp on purpose: it is an average over a closed
    // decade, checked against the current window when the file is read, and there
    // is no sense in which it goes stale before that window moves.
    const persisted = persistedNormals().get(key);
    if (!persisted) return null;

    const promoted: CacheEntry = { at: Date.now(), normals: persisted };
    entries.set(key, promoted);
    return promoted;
  }

  const ttl = entry.normals ? NORMALS_TTL_MS : NORMALS_MISS_TTL_MS;
  if (Date.now() - entry.at > ttl) {
    entries.delete(key);
    return null;
  }

  return entry;
}

export function writeNormals(
  place: string,
  country: string | undefined,
  normals: ClimateNormals | null,
): void {
  const key = climateKey(place, country);

  // Refresh position on rewrite, so an entry that is still being asked for is not
  // the next one evicted.
  entries.delete(key);
  entries.set(key, { at: Date.now(), normals });

  // Eviction below is about this process's memory; the stored copy is about not
  // paying for the download twice, so a place evicted here stays on disk.
  if (normals) persistNormals(key, normals);

  while (entries.size > NORMALS_CACHE_MAX) {
    const oldest = entries.keys().next();
    if (oldest.done) break;
    entries.delete(oldest.value);
  }
}
