export type Tone = 'paper' | 'night';

/**
 * The class that paints a surface in a given tone.
 *
 * These are the absolute fills rather than `var(--surface)`, because a seam has
 * to repeat the exact paint of the panel it is joining — a divider that resolved
 * the tone from its own subtree would come out the colour of the panel it is
 * sitting in, which is the one colour it must not be.
 */
export const SURFACE: Record<Tone, string> = {
  paper: 'surface-paper',
  night: 'surface-night',
};
