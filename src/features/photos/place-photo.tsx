'use client';

import { useEffect, useRef, useState } from 'react';
import Image, { type ImageProps } from 'next/image';

import { placePhotoSrc } from './photo-url';

/**
 * A Commons photograph that asks again when it does not arrive.
 *
 * `<img>` has no retry. Handed an error once — and the image optimizer hands it
 * one whenever a photograph is still queued behind others after seven seconds —
 * it stays empty for the life of the page, no matter that the bytes turned up a
 * second later. Every surface here draws photos in groups, so that is not an
 * edge case: it is what the tail of a batch of previews or a set of hotel cards
 * does on a cold cache.
 *
 * So each failure schedules another attempt under a new `src`. The parameter is
 * ignored by the route and exists only to be different, because the point is to
 * get past the optimizer's answer for the previous one. Attempts are spaced out
 * and finite: a photograph Commons genuinely refuses answers with a status that
 * says so, and the tile stops asking and lets whatever the caller draws
 * underneath stand.
 *
 * These are polls, not fetches. The server is already fetching the photograph
 * in the background and hands the same one to everybody who asks, so an attempt
 * costs a round trip and nothing upstream — which is why the gap stops growing
 * rather than doubling away into a minute.
 */
const RETRIES = 6;
const FIRST_RETRY_MS = 1200;
const MAX_RETRY_MS = 6000;

type PlacePhotoProps = Omit<ImageProps, 'src' | 'onError'> & {
  /** The upstream Commons URL. Proxied, so this is never the `src` as served. */
  url: string;
};

export function PlacePhoto({ url, alt, ...props }: PlacePhotoProps) {
  const [attempt, setAttempt] = useState(0);
  const [exhausted, setExhausted] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // A new photograph is a new set of attempts. Cleared on the way out too, so a
  // photograph unmounted mid-attempt does not come back to set state.
  useEffect(() => {
    setAttempt(0);
    setExhausted(false);
    return () => clearTimeout(timer.current);
  }, [url]);

  if (exhausted) return null;

  const src = placePhotoSrc(url);

  return (
    <Image
      {...props}
      alt={alt}
      src={attempt === 0 ? src : `${src}&attempt=${attempt}`}
      onError={() => {
        if (attempt >= RETRIES) {
          setExhausted(true);
          return;
        }
        clearTimeout(timer.current);
        timer.current = setTimeout(
          () => setAttempt((current) => current + 1),
          Math.min(MAX_RETRY_MS, FIRST_RETRY_MS * 2 ** attempt),
        );
      }}
    />
  );
}
