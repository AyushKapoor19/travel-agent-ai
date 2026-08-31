import 'server-only';

import { imageProvider } from '@/features/photos/server';
import type { PlaceImage } from '@/features/photos/shared';

/**
 * Scoped to the destination, so a chain hotel — or a "Central Market" — is not
 * looked up in the wrong city.
 */
function imageQuery(name: string, destination: string): string {
  return `${name} ${destination}`;
}

/**
 * Photographs for a page of drafts, in one round trip.
 *
 * Batched rather than looked up per card because the image provider paces its own
 * outbound calls, so a card at a time would serialise the whole grid behind
 * Wikipedia's rate limit.
 *
 * The draft and the finished result are kept apart on purpose, and `attach` is
 * where they meet: a search is metered by SerpApi and worth remembering, while the
 * photograph is decoration a caller may not want at all. Cached together, a
 * rate-only lookup would either poison the entry a card later reads or need its own
 * key and its own paid search.
 */
export async function withPlaceImages<Draft extends { name: string }, Result>(
  drafts: readonly Draft[],
  destination: string,
  attach: (draft: Draft, image: PlaceImage | null) => Result,
): Promise<Result[]> {
  const images = await imageProvider().lookup(
    drafts.map((draft) => imageQuery(draft.name, destination)),
  );

  return drafts.map((draft) =>
    attach(draft, images.get(imageQuery(draft.name, destination)) ?? null),
  );
}
