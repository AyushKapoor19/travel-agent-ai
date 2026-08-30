import type { Transition } from 'motion/react';

/**
 * The single easing curve in the product, matching `--ease-wayfare` in CSS so a
 * class-based transition and a JS-driven one arrive at the same time.
 *
 * It leaves slowly and lands hard, which is what makes a long travel read as
 * deliberate rather than sluggish.
 */
export const EASE: [number, number, number, number] = [0.52, 0.01, 0.16, 1];

/** Content settling into place. Long enough to be felt, short enough to skim. */
export function easeTransition(duration = 0.9, delay = 0): Transition {
  return { duration, delay, ease: EASE };
}

/**
 * The four springs anything on this site is allowed to arrive on.
 *
 * Deliberately a closed set. Springs invented per component drift into a dozen
 * nearly-identical curves that no reader can tell apart but which guarantee
 * nothing ever lands in step, so the choice here is by the *weight of the thing
 * moving* rather than by which component wanted it.
 */
export const SPRING = {
  /** A full-width surface: the itinerary reveal, a panel of prose. Slow, with mass. */
  surface: { type: 'spring', stiffness: 200, damping: 26 },
  /** A card or a chat bubble — the everyday arrival. */
  element: { type: 'spring', stiffness: 280, damping: 27, mass: 0.85 },
  /** A dot, a timeline node, a progress mark. Crisp, because it is small. */
  mark: { type: 'spring', stiffness: 380, damping: 23 },
  /**
   * Cursor pull. Slack enough to lag the pointer, loose enough to overshoot on
   * the way back — the only spring here that is meant to be visibly imprecise.
   */
  pull: { stiffness: 160, damping: 15, mass: 0.7 },
} as const satisfies Record<string, Transition>;

/** Stagger step between siblings revealed together, in seconds. */
export const STEP = 0.08;

/** Shorter step for dense lists, where the full STEP would leave the tail late. */
export const STEP_DENSE = 0.06;

/**
 * Delay for the nth sibling in a staggered reveal.
 *
 * Capped, because a stagger is a suggestion of order rather than a queue: past
 * about half a second the last item in a long list reads as having failed to
 * load rather than as arriving in turn.
 */
export function stagger(index: number, step = STEP_DENSE, cap = 0.4): number {
  return Math.min(index * step, cap);
}
