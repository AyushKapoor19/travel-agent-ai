'use client';

import { useEffect, useState } from 'react';

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

/** One photograph. Pass null to skip the request entirely. */
export function usePlaceImage(query: string | null): PlaceImage | null {
  const [image, setImage] = useState<PlaceImage | null>(null);

  useEffect(() => {
    setImage(null);
    if (!query) return;

    const controller = new AbortController();

    fetchPlaceImages([query], { signal: controller.signal })
      .then((found) => setImage(found[query] ?? null))
      .catch(() => {
        // Aborted or offline. The gradient stands in.
      });

    return () => controller.abort();
  }, [query]);

  return image;
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
 * One state update for the whole set rather than one per photograph, because the
 * surfaces that need this are already being moved every frame and re-rendering
 * eight times mid-animation is visible.
 */
export function usePlaceImages(
  queries: readonly string[],
  { width, deferUntilIdle = false }: UsePlaceImagesOptions = {},
): Record<string, PlaceImage> {
  const [images, setImages] = useState<Record<string, PlaceImage>>({});

  useEffect(() => {
    const controller = new AbortController();

    const load = () => {
      fetchPlaceImages(queries, { width, signal: controller.signal })
        .then((found) => {
          if (Object.keys(found).length > 0) setImages(found);
        })
        .catch(() => {
          // Aborted or offline. The tiles keep their flat fill.
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
