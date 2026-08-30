import { LOOKUP_MISS_TTL_MS, PHOTO_CACHE_MAX } from './constants';
import type { Photo } from './types';

/**
 * The photographs this process is holding, and the ones it knows are refused.
 *
 * Two stores rather than one, because they expire on opposite principles: bytes
 * are immutable and only ever dropped for space, while a refusal is a fact about
 * a moment and has to age out on its own.
 */

/** Insertion-ordered, so the first key is the least recently stored. */
const photos = new Map<string, Photo>();

/**
 * Photographs Commons answered with something other than a 429, and when.
 *
 * A refusal that is not about rate is about the file, so asking again is not
 * patience but noise — and worse, it keeps the tile in "not yet" when the
 * honest answer is "never", so it never stops asking either.
 */
const failures = new Map<string, number>();

export function readPhoto(key: string): Photo | undefined {
  return photos.get(key);
}

export function writePhoto(key: string, photo: Photo): void {
  // Re-inserted rather than updated, so a photograph asked for again moves to
  // the young end and is not the next one dropped.
  photos.delete(key);
  photos.set(key, photo);

  while (photos.size > PHOTO_CACHE_MAX) {
    const oldest = photos.keys().next().value;
    if (oldest === undefined) break;
    photos.delete(oldest);
  }
}

/** True while a past refusal still stands. Expired entries are cleared as they are read. */
export function isRefused(key: string): boolean {
  const at = failures.get(key);
  if (at === undefined) return false;

  if (Date.now() - at < LOOKUP_MISS_TTL_MS) return true;

  failures.delete(key);
  return false;
}

export function writeFailure(key: string): void {
  failures.set(key, Date.now());

  // Swept rather than capped: entries expire on their own, so the only job here
  // is to stop a long-lived process accumulating ones nobody will ask about.
  if (failures.size <= PHOTO_CACHE_MAX) return;

  const now = Date.now();
  for (const [failed, at] of failures) {
    if (now - at >= LOOKUP_MISS_TTL_MS) failures.delete(failed);
  }
}
