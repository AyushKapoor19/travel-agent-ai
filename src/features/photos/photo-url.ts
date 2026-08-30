import { COMMONS_PATH_PREFIX, COMMONS_PHOTO_HOST } from './constants';
import { PhotoRoute } from './routes';

/** The contract between a component pointing at a photograph and the route serving it. */

/** Where a component points an `<Image>` to get a Commons photo. */
export function placePhotoSrc(url: string): string {
  return `${PhotoRoute.FILE}?u=${encodeURIComponent(url)}`;
}

/**
 * The upstream a photo request is allowed to reach, or null.
 *
 * A proxy that forwards wherever it is told is an open relay pointed at our own
 * network, so this is an allowlist of one host rather than a sanity check.
 */
export function placePhotoUpstream(value: string | null): URL | null {
  if (!value) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:') return null;
  if (url.hostname !== COMMONS_PHOTO_HOST) return null;
  if (!url.pathname.startsWith(COMMONS_PATH_PREFIX)) return null;

  return url;
}
