/**
 * NASA's Blue Marble, on an actual sphere.
 *
 * The colour map is public-domain NASA imagery at 4096×2048; the relief and
 * ocean masks drive the terrain shading and the water's sheen. Gradients cannot
 * fake this, which is the whole reason the textures are worth their weight.
 */
export const TEXTURES = {
  day: '/earth/earth-day.jpg',
  relief: '/earth/earth-bump.jpg',
  ocean: '/earth/earth-ocean.jpg',
  clouds: '/earth/earth-clouds.png',
} as const;

/**
 * Framing. The whole disc is on screen, centred in its band with room for the
 * atmosphere on every side.
 *
 * A cropped planet was the earlier arrangement and it read as a mistake: the
 * page had to fade the cut edge out, which turned the southern ocean into fog.
 * A complete sphere needs no apology and no gradient to hide behind.
 */
export const DISC_OF_STAGE = 0.82;
export const MAX_DIAMETER_PX = 620;

export type AtmosphereShell = {
  scale: number;
  color: number;
  power: number;
  strength: number;
};

/** Atmosphere shells: a tight bright limb, then a wide soft bloom. */
export const HAZE: AtmosphereShell = {
  scale: 1.045,
  color: 0xc4e9fb,
  power: 1.5,
  strength: 0.7,
};

export const BLOOM: AtmosphereShell = {
  scale: 1.16,
  color: 0x9fd0f0,
  power: 2.2,
  strength: 0.28,
};

/** One rotation every two and a half minutes: present, but never distracting. */
export const SPIN_PER_SECOND = (2 * Math.PI) / 150;

/** Weather outruns the ground beneath it, at any speed the ground is going. */
export const CLOUD_DRIFT_RATIO = 0.22;
export const CLOUD_DRIFT_PER_SECOND = SPIN_PER_SECOND * CLOUD_DRIFT_RATIO;

/**
 * Stirring. A cursor crossing the planet pushes it, in the direction it crossed
 * and in proportion to how fast.
 *
 * Measured in disc widths per second rather than pixels, so the same flick of
 * the wrist reads the same on a phone and on a five-thousand-pixel display —
 * the planet is the ruler, not the screen.
 */
export const BOOST_PER_SWEEP = SPIN_PER_SECOND * 4;

/**
 * Ten times the ambient drift, either way: brisk without becoming a fairground,
 * and symmetric, so pushing back is exactly as strong as pushing along.
 */
export const MAX_BOOST = SPIN_PER_SECOND * 10;

/** Seconds for a push to fall to half. Long enough to read as mass. */
export const BOOST_HALF_LIFE = 0.55;

/** Below a hundredth of the drift there is nothing left to see. */
export const BOOST_FLOOR = SPIN_PER_SECOND * 0.01;

/**
 * Sun direction, normalised where it is used. Puts the terminator down the
 * right-hand limb.
 *
 * A plain tuple rather than a `Vector3` so this module stays free of three.js:
 * the placeholder disc reads the framing constants above, and it is on the
 * critical path that the globe is deliberately kept off.
 */
export const SUN_DIRECTION = [-0.62, 0.52, 0.58] as const;

/** Distance the light is placed along the sun vector. Orthographic, so arbitrary. */
export const LIGHT_DISTANCE = 1000;

/** Enough segments that the limb is a circle rather than a polygon. */
export const SPHERE_SEGMENTS = 96;

/** The camera sits far enough back that nothing clips; the projection is flat anyway. */
export const CAMERA_DISTANCE = 2000;
export const CAMERA_FAR = 4000;

/** Two is the point past which more pixels buy nothing on a sphere this size. */
export const MAX_PIXEL_RATIO = 2;

/** Axial tilt, plus a shade of looking down on the northern hemisphere. */
export const TILT_Z_DEG = -16;
export const TILT_X_DEG = -12;

/** A frame this long is a tab coming back, not a frame. */
export const MAX_FRAME_SECONDS = 0.1;

export const Surface = {
  /** Shown until the colour map lands, so the sphere is never a white hole. */
  BASE_COLOR: 0x0d2f4a,
  BUMP_SCALE: 0.04,
  /** White where there is water, so only the oceans catch the sun. */
  SPECULAR_COLOR: 0x2f4f63,
  SHININESS: 14,
  LIT_COLOR: 0xffffff,
} as const;

export const Clouds = {
  /** Just clear of the surface, or the two z-fight along the limb. */
  SCALE: 1.006,
  OPACITY: 0.82,
} as const;

export const Light = {
  SUN_COLOR: 0xfff6ec,
  SUN_INTENSITY: 3.1,
  /** Earthshine on the night side, so the dark limb is blue rather than black. */
  AMBIENT_COLOR: 0x5d7f9e,
  AMBIENT_INTENSITY: 0.55,
} as const;
