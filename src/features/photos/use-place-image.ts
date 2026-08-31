'use client';

import { useEffect, useMemo, useState } from 'react';

import { whenIdle } from '@/lib/when-idle';

import { fetchPlaceImages } from './client';
import type { PlaceImage } from './types';

/**
 * Place photographs, for surfaces the server could not have known about.
 *
 * Both hooks are progressive by design: the caller draws its gradient
 * immediately and the photo fades in when it arrives, so a slow or failed lookup
 * costs nothing but the gradient staying.
 */

/** Idle-deferral window for a batch that is decoration rather than content. */
const IDLE_TIMEOUT_MS = 2500;
const IDLE_FALLBACK_MS = 1200;

/**
 * How many times a throttled lookup is asked again, and how long it waits.
 *
 * The counterpart to the ladder in `<PlacePhoto>`, and it was missing: that one
 * retries the *bytes* of a photograph six times, while the question of which
 * photograph it is got exactly one attempt. A rate limit falls on the lookup
 * first — it is the call an itinerary makes a dozen of — so the half of the
 * pipeline with no patience was the half that needed it.
 *
 * Longer gaps than the photo ladder, because Wikipedia's search limit is a rate
 * over seconds rather than a queue of four, and coming back quickly is how a
 * cool-off gets extended rather than waited out.
 */
const LOOKUP_RETRIES = 4;
const LOOKUP_RETRY_BASE_MS = 1500;
const LOOKUP_RETRY_MAX_MS = 12000;

function retryDelay(attempt: number): number {
  return Math.min(LOOKUP_RETRY_MAX_MS, LOOKUP_RETRY_BASE_MS * 2 ** attempt);
}

/** A pause that ends early when the caller has gone away. */
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };

    const timer = setTimeout(finish, ms);
    signal.addEventListener('abort', finish);
  });
}

type LoadOptions = {
  width?: number;
  signal: AbortSignal;
  onImages: (images: Record<string, PlaceImage>) => void;
};

/**
 * Asks for a set of photographs, then asks again for whichever ones came back
 * unanswered, until they are answered or the ladder runs out.
 *
 * Results are handed over as they arrive rather than at the end, so the days
 * that resolved on the first attempt are drawn immediately and the stragglers
 * fade in behind them.
 */
async function loadWithRetry(queries: readonly string[], options: LoadOptions): Promise<void> {
  let remaining = queries;

  for (let attempt = 0; remaining.length > 0; attempt += 1) {
    let pending: string[];

    try {
      const result = await fetchPlaceImages(remaining, {
        width: options.width,
        signal: options.signal,
      });

      if (options.signal.aborted) return;
      if (Object.keys(result.images).length > 0) options.onImages(result.images);

      pending = result.pending;
    } catch {
      // Aborted, or the network is gone. The first is handled below; the second
      // is exactly the kind of thing worth another attempt.
      if (options.signal.aborted) return;
      pending = [...remaining];
    }

    if (pending.length === 0 || attempt >= LOOKUP_RETRIES) return;

    await wait(retryDelay(attempt), options.signal);
    if (options.signal.aborted) return;

    remaining = pending;
  }
}

export type UsePlaceImageOptions = {
  /** Source width to request, for photographs drawn smaller than the default. */
  width?: number;
};

/** One photograph. Pass null to skip the request entirely. */
export function usePlaceImage(
  query: string | null,
  { width }: UsePlaceImageOptions = {},
): PlaceImage | null {
  const queries = useMemo(() => (query ? [query] : []), [query]);
  const images = usePlaceImages(queries, { width });

  return query ? (images[query] ?? null) : null;
}

export type UsePlaceImagesOptions = {
  /** Source width to request, for tiles drawn far smaller than the default. */
  width?: number;
  /**
   * Hold the request back until the browser is idle.
   *
   * For photographs that are decoration: on the landing page the destination
   * previews must not compete with the hero's globe, which is two megabytes the
   * reader is actually looking at.
   */
  deferUntilIdle?: boolean;
};

/**
 * A set of photographs, fetched together and keyed by query.
 *
 * One state update per batch rather than one per photograph, because the
 * surfaces that need this are already being moved every frame and re-rendering
 * eight times mid-animation is visible.
 *
 * `queries` is a hook dependency, so callers must hand over a stable array —
 * module scope for a fixed set, `useMemo` for a computed one.
 */
export function usePlaceImages(
  queries: readonly string[],
  { width, deferUntilIdle = false }: UsePlaceImagesOptions = {},
): Record<string, PlaceImage> {
  const [images, setImages] = useState<Record<string, PlaceImage>>({});

  useEffect(() => {
    if (queries.length === 0) return;

    const controller = new AbortController();

    const load = () => {
      void loadWithRetry(queries, {
        width,
        signal: controller.signal,
        // Merged rather than replaced: a retry carries only the stragglers, and
        // assigning it wholesale would drop the photographs already on screen.
        onImages: (found) => setImages((current) => ({ ...current, ...found })),
      });
    };

    if (!deferUntilIdle) {
      load();
      return () => controller.abort();
    }

    const cancelIdle = whenIdle(load, {
      timeoutMs: IDLE_TIMEOUT_MS,
      fallbackDelayMs: IDLE_FALLBACK_MS,
    });

    return () => {
      controller.abort();
      cancelIdle();
    };
  }, [queries, width, deferUntilIdle]);

  return images;
}
