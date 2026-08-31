import type { PlaceImage } from '@/features/photos/shared';
import { placeNameKey } from '@/lib/place-name-key';

/**
 * Said when the photograph is of somewhere else in the same city.
 *
 * Wikipedia has an article for Tanah Lot and none for a neighbourhood restaurant,
 * so the lookup falls back to a nearby landmark — a card for "A Nossa Casa" came
 * back illustrated with Lisbon Cathedral. The photo is still worth showing, and the
 * caption is what stops it being a claim.
 */
const NEARBY_CAPTION = 'Nearby';

/**
 * Undefined when the photo is of the subject itself, which needs no qualifying.
 *
 * Keyed rather than compared as written, because the lookup answers with
 * Wikipedia's title for a place and the card carries the provider's — the same
 * spelling mismatch `placeNameKey` exists for everywhere else.
 */
export function photoCaption(image: PlaceImage | null, subject: string): string | undefined {
  const shown = image?.subject;
  if (!shown) return undefined;

  return placeNameKey(shown) === placeNameKey(subject) ? undefined : NEARBY_CAPTION;
}
