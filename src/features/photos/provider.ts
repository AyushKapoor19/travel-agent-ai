import { MAX_THUMB_WIDTH, MIN_THUMB_WIDTH, UNKNOWN_CREDIT } from './constants';
import { isTransient } from './errors';
import { fetchLicenses, licenseFor } from './licenses';
import { readLookup, writeLookup } from './lookup-cache';
import { warmPlacePhoto } from './photo-proxy';
import { findCandidate } from './search';
import type { ImageCandidate, ImageProvider, LookupOptions, PlaceImage } from './types';

/**
 * Photos of real places, from Wikimedia Commons via the Wikipedia search API.
 *
 * Chosen because it needs no API key or account, and because every result
 * carries the author and licence we are obliged to display. `subject` is the
 * article the photo came from, which is what the image actually shows — the
 * UI captions it rather than implying the photo is of a specific property.
 */

/** Commons serves arbitrary widths, but a bogus one is a 400 rather than a clamp. */
function thumbWidth(requested: number | undefined): number {
  if (!requested || !Number.isFinite(requested)) return MAX_THUMB_WIDTH;
  return Math.min(MAX_THUMB_WIDTH, Math.max(MIN_THUMB_WIDTH, Math.round(requested)));
}

function toPlaceImage(
  candidate: ImageCandidate,
  credit: { credit: string; license: string; licenseUrl: string } | undefined,
): PlaceImage {
  return {
    url: candidate.url,
    width: candidate.width,
    height: candidate.height,
    subject: candidate.subject,
    pageUrl: candidate.pageUrl,
    credit: credit?.credit ?? UNKNOWN_CREDIT,
    license: credit?.license ?? '',
    licenseUrl: credit?.licenseUrl ?? '',
  };
}

export const wikimediaImageProvider: ImageProvider = {
  name: 'wikimedia',

  async lookup(
    queries: readonly string[],
    options?: LookupOptions,
  ): Promise<Map<string, PlaceImage | null>> {
    const width = thumbWidth(options?.width);
    const results = new Map<string, PlaceImage | null>();
    const pending: string[] = [];

    for (const query of new Set(queries)) {
      const hit = readLookup(query, width);
      if (!hit) {
        pending.push(query);
        continue;
      }

      results.set(query, hit.image);
      // Known place, but the bytes may have aged out of the photo cache even
      // though the answer about which photograph it is has not.
      if (hit.image) warmPlacePhoto(hit.image.url);
    }

    if (pending.length === 0) return results;

    // A failed lookup must never fail the surrounding tool call: a card
    // without a photo still renders on its gradient.
    const throttled = new Set<string>();
    const found = await Promise.all(
      pending.map(async (query) => {
        try {
          return await findCandidate(query, width);
        } catch (error) {
          // Rate limited or a server blip. Remember, so this query is not
          // written to the cache as a place that simply has no photo.
          if (isTransient(error)) throttled.add(query);
          return null;
        }
      }),
    );

    const candidates = found.filter((candidate): candidate is ImageCandidate => candidate !== null);

    const licenses = await fetchLicenses(candidates.map((candidate) => candidate.fileName)).catch(
      () => new Map(),
    );

    for (const candidate of candidates) {
      const image = toPlaceImage(candidate, licenseFor(licenses, candidate.fileName));

      results.set(candidate.query, image);
      writeLookup(candidate.query, width, image);
      warmPlacePhoto(image.url);
    }

    for (const query of pending) {
      if (results.has(query)) continue;

      // Left out of the map entirely rather than answered with null: the caller
      // has to be able to tell "nothing here" from "could not find out", or a
      // rate limit reads as a place with no photograph and nobody asks again.
      if (throttled.has(query)) continue;

      results.set(query, null);
      writeLookup(query, width, null);
    }

    return results;
  },
};

/** Single seam, matching the hotel and activity providers. */
export function imageProvider(): ImageProvider {
  return wikimediaImageProvider;
}
