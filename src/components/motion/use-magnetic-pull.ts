'use client';

import { useCallback } from 'react';

import type { MotionValue } from 'motion/react';
import { useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react';
import type { PointerEvent } from 'react';

import { SPRING } from '@/lib/design/motion';

/**
 * Anything asked to trail the shape it sits in moves this fraction as far, which
 * is what stops the pair reading as one rigid object being dragged around.
 */
const DRIFT_RATIO = 0.5;

export type MagneticPull = {
  /** The element's own offset. */
  pull: { x: MotionValue<number>; y: MotionValue<number> };
  /** Half of it, for anything that should trail the element. */
  drift: { x: MotionValue<number>; y: MotionValue<number> };
  /** Attach to `onPointerMove`. */
  track: (event: PointerEvent<HTMLElement>) => void;
  /** Attach to `onPointerLeave`, and to `onBlur` where the element can be focused. */
  release: () => void;
};

/**
 * Cursor pull, as spring-backed offsets and the handlers that feed them.
 *
 * Mouse-only by construction: the pull needs a pointer that hovers before it
 * commits, and on a touch screen the next thing after the finger arrives is the
 * tap, so the effect never has time to read.
 *
 * @param strength Full travel across the element in pixels, so the offset tops
 * out at half of it in each direction. Required, because the right amount is a
 * property of the thing being leaned — a sphere in empty space can afford to
 * swing, and a text field you are aiming a cursor at cannot.
 */
export function useMagneticPull(strength: number): MagneticPull {
  // `MotionConfig reducedMotion="user"` only suppresses declarative animations.
  // This is driven imperatively, so it has to opt out by hand.
  const still = useReducedMotion();

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const pullX = useSpring(x, SPRING.pull);
  const pullY = useSpring(y, SPRING.pull);

  const driftX = useTransform(pullX, (value) => value * DRIFT_RATIO);
  const driftY = useTransform(pullY, (value) => value * DRIFT_RATIO);

  const track = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType !== 'mouse' || still) return;

      const bounds = event.currentTarget.getBoundingClientRect();
      x.set(((event.clientX - bounds.left) / bounds.width - 0.5) * strength);
      y.set(((event.clientY - bounds.top) / bounds.height - 0.5) * strength);
    },
    [still, strength, x, y],
  );

  const release = useCallback(() => {
    x.set(0);
    y.set(0);
  }, [x, y]);

  return { pull: { x: pullX, y: pullY }, drift: { x: driftX, y: driftY }, track, release };
}
