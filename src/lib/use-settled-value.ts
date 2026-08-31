'use client';

import { useEffect, useState } from 'react';

/**
 * Reports a value only once it has stopped changing.
 *
 * Written for streamed text: a day heading arrives a token at a time, and
 * anything keyed on it — a photo lookup, a request of any kind — would otherwise
 * fire once per character.
 *
 * Undefined until the first quiet period, rather than seeded with whatever the
 * value happened to be at mount. Seeding is the tempting version and it defeats
 * the whole point: a component that mounts mid-stream mounts on a fragment, so
 * the very first thing the caller does is fire the request for `## Day 3: Sin`
 * that this hook exists to prevent — and the delay only ever applies from the
 * second token onwards.
 */
export function useSettledValue<T>(value: T, delayMs: number): T | undefined {
  const [settled, setSettled] = useState<T>();

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}
