import type { PlaceImage } from './types';

/**
 * The credit line, as the licence requires it to appear.
 *
 * Written out at four separate call sites before this existed, which is four
 * chances for one of them to drop the licence name — and the attribution is a
 * condition of using the photograph at all, not a caption we can restyle.
 */

export type PhotoCreditOptions = {
  /**
   * What the photo is standing in for, when that is not the same as its subject.
   * A stay's photo shows the neighbourhood, so the card says so rather than
   * letting a reader take it for a picture of the building.
   */
  context?: string;
};

export function photoCreditTitle(image: PlaceImage, options: PhotoCreditOptions = {}): string {
  const prefix = options.context ? `${options.context} — ` : '';
  const license = image.license ? ` (${image.license})` : '';

  return `${prefix}${image.subject}. Photo: ${image.credit}${license}`;
}

/** The visible attribution: subject and author, short enough for a corner. */
export function photoCreditLabel(image: PlaceImage): string {
  return `${image.subject} · ${image.credit}`;
}
