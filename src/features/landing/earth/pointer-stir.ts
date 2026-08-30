import { MathUtils } from 'three';

import { BOOST_FLOOR, BOOST_HALF_LIFE, BOOST_PER_SWEEP, HAZE, MAX_BOOST } from './constants';

/**
 * The push a cursor gives the planet as it crosses.
 *
 * Kept apart from the scene because it is physics rather than rendering, and
 * because it is the part with the taste in it: how far out a cursor still counts,
 * what a sweep is worth, how a second gesture argues with the first, how long any
 * of it survives. Speeds are measured in disc widths per second, so the feel does
 * not change with the size of the display.
 */
export class PointerStir {
  /** Extra radians per second, signed. Zero when nothing is being stirred. */
  private boost = 0;

  /** Where the cursor last was and when, in page pixels. Null between gestures. */
  private trace: { x: number; time: number } | null = null;

  get value(): number {
    return this.boost;
  }

  /**
   * Reads a pointer position and, when it continues a sweep across the planet,
   * turns the horizontal speed of it into a push.
   *
   * @param box The canvas's client rect, so the pointer is placed against the
   * disc rather than against the page.
   * @param diameter The disc's rendered diameter in CSS pixels.
   */
  sample(event: PointerEvent, box: DOMRect, diameter: number): void {
    if (diameter === 0) return;

    const x = event.clientX - (box.left + box.width / 2);
    const y = event.clientY - (box.top + box.height / 2);

    // Out to the edge of the bright ring of air on the limb, which is as far as
    // the sphere still looks like the thing under the cursor.
    const reach = (diameter / 2) * HAZE.scale;

    if (x * x + y * y > reach * reach) {
      // Re-entering somewhere else is a new gesture, not a jump across the gap
      // at whatever speed that crossing would imply.
      this.trace = null;
      return;
    }

    const previous = this.trace;
    this.trace = { x: event.clientX, time: event.timeStamp };
    if (!previous) return;

    const seconds = (event.timeStamp - previous.time) / 1000;
    if (seconds <= 0) return;

    // Signed, and horizontal only: the axis the sphere turns about has no answer
    // to a vertical drag.
    const sweeps = (event.clientX - previous.x) / seconds / diameter;
    const push = MathUtils.clamp(sweeps * BOOST_PER_SWEEP, -MAX_BOOST, MAX_BOOST);

    // Pushing the way the planet is already going, only the strongest reading
    // counts, so a fast flick lands whole and the slow drag trailing out of it
    // cannot drain what the flick just gave. Pushing the other way takes over
    // outright: a reader reversing their hand is asking the planet to reverse,
    // and making them out-muscle their own last gesture would read as the planet
    // ignoring them.
    if (push * this.boost <= 0 || Math.abs(push) > Math.abs(this.boost)) this.boost = push;
  }

  /**
   * Eases the push out.
   *
   * Framerate-independent, unlike a per-frame multiplier: a stir has to take the
   * same time to die down on a 144Hz screen as on a 60Hz one. Scaling preserves
   * the sign, so this is the same decay in both directions.
   */
  decay(elapsedSeconds: number): void {
    if (this.boost === 0) return;

    this.boost *= Math.pow(0.5, elapsedSeconds / BOOST_HALF_LIFE);
    if (Math.abs(this.boost) < BOOST_FLOOR) this.boost = 0;
  }

  /**
   * Forgets everything.
   *
   * Called when the planet leaves the screen: coming back to it spinning is a
   * state the reader never asked for and cannot account for.
   */
  reset(): void {
    this.boost = 0;
    this.trace = null;
  }
}
