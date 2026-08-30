import { LOOKUP_HIT_TTL_MS, LOOKUP_MISS_TTL_MS } from './constants';
import type { PlaceImage } from './types';

/**
 * Which photograph belongs to a place, remembered per process.
 *
 * A miss is cached too, but for far less time, so that a place with genuinely no
 * usable photograph is not looked up on every render while a place that failed
 * once gets another chance within a couple of minutes.
 */

type CacheEntry = { at: number; image: PlaceImage | null };

const entries = new Map<string, CacheEntry>();

/** Keyed on the width too: the same place at two sizes is two different URLs. */
function keyOf(query: string, width: number): string {
  return `${width}:${query}`;
}

export function readLookup(query: string, width: number): CacheEntry | null {
  const key = keyOf(query, width);
  const entry = entries.get(key);
  if (!entry) return null;

  const ttl = entry.image ? LOOKUP_HIT_TTL_MS : LOOKUP_MISS_TTL_MS;
  if (Date.now() - entry.at > ttl) {
    entries.delete(key);
    return null;
  }

  return entry;
}

export function writeLookup(query: string, width: number, image: PlaceImage | null): void {
  entries.set(keyOf(query, width), { at: Date.now(), image });
}
