import { HttpStatus, UPSTREAM_REVALIDATE_SECONDS } from '@/lib/http';

import {
  DEFAULT_PHOTO_CONTENT_TYPE,
  IMAGE_ACCEPT_HEADER,
  PHOTO_DEADLINE_MS,
  PHOTO_RETRIES,
  PHOTO_TIMEOUT_MS,
  USER_AGENT,
} from './constants';
import { isTransient, TransientImageError } from './errors';
import { isRefused, readPhoto, writeFailure, writePhoto } from './photo-store';
import { acquireSlot, backOff, releaseSlot, retryAfterMs, waitOutRefusal } from './photo-throttle';
import { placePhotoUpstream } from './photo-url';
import type { Photo, PhotoResult } from './types';

/* ---------------------------------------------------------------------------
   The photographs themselves

   Commons serves about four callers at once and refuses the rest with a 429 and
   a one-second `retry-after`. A page that points a reader's browser straight at
   a screenful of photographs therefore keeps whichever four it was given and
   draws empty tiles for the rest — and it fails again on the next reader,
   because nothing in that path ever asks twice.

   So the bytes come through us: a few at a time, asked again when refused, and
   held here afterwards, which means Commons is touched once per photograph
   rather than once per visit.

   The thing that makes this delicate is that we are not the only clock running.
   `next/image` aborts its own fetch of this route after seven seconds flat, and
   an `<img>` the optimizer has answered with an error never asks again — so a
   photograph still queued at that point is not slow, it is gone for the life of
   the page. Everything below is arranged around that: work is deduplicated so a
   queue never forms twice, a request that cannot be served in time bows out
   early instead of being cut off, and the fetch it bowed out of keeps running so
   the retry lands on bytes that are already here.
   --------------------------------------------------------------------------- */

/** One load per URL, however many tiles are pointed at it. */
const loads = new Map<string, Promise<Photo>>();

/**
 * One attempt at the bytes, or a signal to try again.
 *
 * @throws TransientImageError when patience ran out rather than the photograph
 * being unavailable.
 */
async function attemptFetch(url: URL, key: string): Promise<Photo> {
  for (let attempt = 0; ; attempt += 1) {
    await waitOutRefusal();

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: IMAGE_ACCEPT_HEADER },
        signal: AbortSignal.timeout(PHOTO_TIMEOUT_MS),
        next: { revalidate: UPSTREAM_REVALIDATE_SECONDS },
      });
    } catch {
      // Timed out, or the connection never came up. Neither says anything
      // about the photograph, so this is patience rather than a refusal.
      if (attempt >= PHOTO_RETRIES) throw new TransientImageError('Commons unreachable');
      backOff(0, attempt);
      continue;
    }

    if (response.ok) {
      const photo: Photo = {
        body: await response.arrayBuffer(),
        contentType: response.headers.get('content-type') ?? DEFAULT_PHOTO_CONTENT_TYPE,
      };
      writePhoto(key, photo);
      return photo;
    }

    // Drained rather than abandoned, so the connection is reusable for the
    // retry instead of being torn down and dialled again.
    await response.arrayBuffer().catch(() => {});

    if (response.status !== HttpStatus.TOO_MANY_REQUESTS) {
      writeFailure(key);
      throw new Error(`Commons ${response.status}`);
    }

    // Out of patience, not out of hope: whoever asked should be told to come
    // back rather than told the photograph does not exist.
    if (attempt >= PHOTO_RETRIES) throw new TransientImageError('Commons 429');

    backOff(retryAfterMs(response), attempt);
  }
}

/**
 * The bytes, fetched at most once.
 *
 * Deliberately detached from whoever asked first: the promise lives in `loads`
 * rather than in a caller, so a request that gives up waiting leaves the fetch
 * running instead of cancelling the work its own retry is about to need.
 */
function loadPhoto(url: URL): Promise<Photo> {
  const key = url.toString();

  const held = readPhoto(key);
  if (held) return Promise.resolve(held);

  // A photograph Commons refused for a reason that is not rate: answered as a
  // plain failure so the tile stops polling rather than waiting for bytes that
  // are never coming.
  if (isRefused(key)) return Promise.reject(new Error('Commons refused'));

  const running = loads.get(key);
  if (running) return running;

  const load = (async (): Promise<Photo> => {
    await acquireSlot();
    try {
      return await attemptFetch(url, key);
    } finally {
      releaseSlot();
    }
  })();

  loads.set(key, load);
  // Cleared either way: a success is in the store now, and a photograph that ran
  // out of patience should be a fresh attempt next time rather than a rejection
  // served forever.
  void load.then(
    () => loads.delete(key),
    () => loads.delete(key),
  );

  return load;
}

/**
 * Starts fetching a photograph nobody has asked for yet.
 *
 * Called the moment a lookup resolves, which buys the queue the round trip the
 * browser spends parsing the answer and pointing an `<img>` at it. On a batch
 * of eight that head start is most of the difference between every photograph
 * arriving and the last few having to ask twice.
 */
export function warmPlacePhoto(url: string): void {
  const upstream = placePhotoUpstream(url);
  if (!upstream) return;
  void loadPhoto(upstream).catch(() => {});
}

/**
 * Waits a bounded time for a photograph and reports which of the three answers
 * applies, so the route can pick a status code the client can act on.
 */
export async function fetchPlacePhoto(url: URL): Promise<PhotoResult> {
  const load = loadPhoto(url);

  // Claimed here rather than only inside the race, so bowing out on the
  // deadline does not leave the rejection looking unhandled.
  let refused = false;
  const settled = load.then(
    (photo) => photo,
    (error: unknown) => {
      refused = !isTransient(error);
      return null;
    },
  );

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), PHOTO_DEADLINE_MS);
  });

  try {
    const photo = await Promise.race([settled, deadline]);
    if (photo) return { status: 'ok', ...photo };
    return refused ? { status: 'failed' } : { status: 'pending' };
  } finally {
    clearTimeout(timer);
  }
}
