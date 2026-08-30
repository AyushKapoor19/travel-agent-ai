import type { Flag } from './flags';

/**
 * Where each flag sits, worked out once.
 *
 * Pure, and separate from the component that draws it: this is the part with an
 * answer that can be checked, and it must produce the same answer on the server
 * as in the browser.
 */

/** An inclusive span the scatter picks a whole number from. */
type Range = { min: number; max: number };

/**
 * The band the run occupies, as percentages of the field, right to left.
 *
 * Close enough to the edges that the end tiles — centred on these points and far
 * wider than the margin left over — hang off the screen, so the fan reads as cut
 * off rather than as stopping politely short.
 */
const START_PERCENT = 96;
const END_PERCENT = 4;

/** Heights, as percentages. The run is tilted: it starts low and ends high. */
const TOP_FIRST = 65;
const TOP_LAST = 35;
const TOP_MIDDLE = 50;

/** Scatter for the tiles either side of the middle, which lean apart slightly. */
const TOP_BEFORE_MIDDLE = { min: 30, max: 60 } as const;
const TOP_AFTER_MIDDLE = { min: 40, max: 70 } as const;

const ROTATE_RANGE = { min: -30, max: 30 } as const;

/** Stacking. The middle tile is lifted clear of the rest; see below. */
const DEPTH_RANGE = { min: 0, max: 9 } as const;
const DEPTH_MIDDLE = 20;

/** Fixed, so the layout is the same every visit and can be judged once. */
const NOISE_SEED = 0x7a9f21;

const UINT32 = 4_294_967_296;

export type FlagTile = Flag & {
  /** Percentage across the field, from the left. */
  left: number;
  /** Percentage down the field. */
  top: number;
  /** Degrees. */
  rotate: number;
  /** `z-index`. */
  depth: number;
};

/**
 * Deterministic noise.
 *
 * The scatter wants to look unplanned, but it must not actually be random: the
 * server and the client have to agree on every top and every angle or the whole
 * field rearranges itself on hydration. A fixed seed buys the look without the
 * flicker.
 */
function noise(seed: number): () => number {
  let state = seed;

  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / UINT32;
  };
}

/**
 * Lays the flags out across the field.
 *
 * Returns each flag together with its position rather than a parallel array of
 * placements, so there is no index to line the two up by and no element the
 * caller has to prove exists.
 *
 * The step between tiles is derived from the band and the number of flags rather
 * than fixed, because a fixed step means the run gets longer every time someone
 * adds a country and eventually walks off the left-hand side entirely.
 */
export function placeFlags(flags: readonly Flag[]): FlagTile[] {
  const random = noise(NOISE_SEED);
  const middle = Math.floor(flags.length / 2);
  const step = (START_PERCENT - END_PERCENT) / (flags.length - 1);

  const spread = ({ min, max }: Range) => Math.round(random() * (max - min) + min);

  return flags.map((flag, index) => {
    // The middle tile is pinned to the vertical centre because it is the one the
    // button sits on top of, and a tile *nearly* lined up with the button reads
    // as a mistake in a way that an exact match does not.
    let top: number;
    if (index === 0) top = TOP_FIRST;
    else if (index === flags.length - 1) top = TOP_LAST;
    else if (index === middle) top = TOP_MIDDLE;
    else if (index < middle) top = spread(TOP_BEFORE_MIDDLE);
    else top = spread(TOP_AFTER_MIDDLE);

    return {
      ...flag,
      left: START_PERCENT - index * step,
      top,
      rotate: spread(ROTATE_RANGE),
      // That same tile is deliberately in front of its neighbours, so the glass
      // of the button has one clean subject to refract.
      depth: index === middle ? DEPTH_MIDDLE : spread(DEPTH_RANGE),
    };
  });
}
