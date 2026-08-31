import { RESPONSE_CACHE_MAX, RESPONSE_MISS_TTL_MS, RESPONSE_TTL_MS } from './constants';

/**
 * A per-process store for one kind of SerpApi answer, with the quota in mind.
 *
 * Written as a factory because there are three of these — attractions, stays,
 * fares — and they differ only in what they hold. The climate cache is the same
 * design specialised to one type; this is that shape with the type lifted out,
 * since a third hand-rolled copy is where the eviction rules start to diverge.
 *
 * A miss is cached too, briefly. That is the part worth keeping: without it, a
 * destination Google has nothing for is re-searched on every turn of the
 * conversation, and each of those attempts is billed against a 250-a-month
 * allowance.
 *
 * Insertion-ordered eviction rather than true LRU, because a conversation touches
 * a handful of destinations and the two orders barely differ at that size.
 */

type CacheEntry<T> = { at: number; value: T | null };

export type TtlCache<T> = {
  /** Null when absent or expired, which the caller must tell apart from a cached miss. */
  read(key: string): CacheEntry<T> | null;
  write(key: string, value: T | null): void;
};

export function createTtlCache<T>(): TtlCache<T> {
  const entries = new Map<string, CacheEntry<T>>();

  return {
    read(key) {
      const entry = entries.get(key);
      if (!entry) return null;

      const ttl = entry.value ? RESPONSE_TTL_MS : RESPONSE_MISS_TTL_MS;
      if (Date.now() - entry.at > ttl) {
        entries.delete(key);
        return null;
      }

      return entry;
    },

    write(key, value) {
      // Refresh position on rewrite, so an entry still being asked for is not the
      // next one evicted.
      entries.delete(key);
      entries.set(key, { at: Date.now(), value });

      while (entries.size > RESPONSE_CACHE_MAX) {
        const oldest = entries.keys().next();
        if (oldest.done) break;
        entries.delete(oldest.value);
      }
    },
  };
}

/**
 * The remembered answer, or a fresh one remembered on the way out.
 *
 * Every provider here wants the same three-step dance and got it slightly wrong in
 * slightly different words: a hit means the entry, even a cached miss, so an empty
 * hit must not trigger another paid search; and a build that throws must not be
 * written at all, or a rate limit leaves a destination with nothing to do for the
 * rest of the hour. Both of those are one-line mistakes to make twice.
 */
export async function cachedList<T>(
  cache: TtlCache<T[]>,
  key: string,
  build: () => Promise<T[]>,
): Promise<T[]> {
  const entry = cache.read(key);
  if (entry) return entry.value ?? [];

  const built = await build();
  cache.write(key, built.length > 0 ? built : null);

  return built;
}

/**
 * A cache key from the parts that change the answer.
 *
 * Lower-cased and trimmed so "Bali" and "bali " are one destination, and
 * `undefined` parts collapse to empty rather than to the string "undefined" —
 * otherwise a query with no dates and a query with dates it forgot to pass would
 * be two different keys for the same request.
 */
export function cacheKey(...parts: readonly (string | number | undefined | null)[]): string {
  return parts
    .map((part) =>
      String(part ?? '')
        .trim()
        .toLowerCase(),
    )
    .join('|');
}
