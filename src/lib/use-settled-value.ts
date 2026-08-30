'use client';

import { useEffect, useState } from 'react';

/**
 * Holds a value still until it stops changing.
 *
 * Written for streamed text: a day heading arrives a token at a time, and
 * anything keyed on it — a photo lookup, a request of any kind — would otherwise
 * fire once per character.
 */
export function useSettledValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}
