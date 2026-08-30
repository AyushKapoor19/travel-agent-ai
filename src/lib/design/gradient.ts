/**
 * Deterministic gradients for anything with no photograph.
 *
 * A mock stay has no image behind it and a lookup can come back empty, so every
 * card needs something to sit on. A generated gradient that is stable for a given
 * id reads as a deliberate design choice, where a broken `<img>` reads as a bug —
 * and being derived from the id rather than random means the same card looks the
 * same on the server, on the client, and on the reader's second visit.
 */

const PALETTE = [
  ['#c9e7ef', '#93c9db'],
  ['#cbe8dc', '#97cdbb'],
  ['#f4dbc9', '#e2b498'],
  ['#d3ddf3', '#a9bce6'],
  ['#e2d7ee', '#c0abd8'],
  ['#cbe8e4', '#98cbc6'],
] as const satisfies ReadonlyArray<readonly [string, string]>;

/** Chosen so the hash stays well inside a float's exact integer range. */
const HASH_MODULUS = 100_000;
const HASH_FACTOR = 31;

/** The angle every placeholder is raked at, so a grid of them agrees. */
const GRADIENT_ANGLE_DEG = 140;

type GradientStops = { from: string; to: string };

function hash(seed: string): number {
  let value = 0;
  for (let index = 0; index < seed.length; index += 1) {
    value = (value * HASH_FACTOR + seed.charCodeAt(index)) % HASH_MODULUS;
  }
  return value;
}

function gradientFor(seed: string): GradientStops {
  // Indexed with a modulus of the palette's own length, so this cannot miss —
  // asserted rather than guarded because a fallback here would be unreachable
  // code pretending to be defensive.
  const [from, to] = PALETTE[hash(seed) % PALETTE.length]!;
  return { from, to };
}

/** Ready to hand to `background`, so no component has to write gradient syntax. */
export function gradientCss(seed: string): string {
  const { from, to } = gradientFor(seed);
  return `linear-gradient(${GRADIENT_ANGLE_DEG}deg, ${from}, ${to})`;
}
