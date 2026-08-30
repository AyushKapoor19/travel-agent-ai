import { z } from 'zod';

/**
 * The shapes the rest of the app knows about.
 *
 * `PlaceImage` is validated rather than typed, because it crosses the network in
 * both directions: the lookup route serialises it and every client surface
 * re-parses it, so a change in the provider cannot quietly reach the UI.
 */

export const placeImageSchema = z.object({
  url: z.string(),
  width: z.number(),
  height: z.number(),
  /** The Wikipedia article the photo belongs to, e.g. "Alfama". */
  subject: z.string(),
  pageUrl: z.string(),
  credit: z.string(),
  license: z.string(),
  licenseUrl: z.string(),
});

export type PlaceImage = z.infer<typeof placeImageSchema>;

export type LookupOptions = {
  /**
   * Width of the thumbnail to ask Commons for, in pixels.
   *
   * Worth setting for anything small. `upload.wikimedia.org` throttles on bytes
   * per caller, not on requests, so a screen that fills eight tiles with
   * full-width photographs it then paints at a tenth of the size will have the
   * back half of the set answered with 429 and nothing to draw.
   */
  width?: number;
};

export type ImageProvider = {
  name: string;
  /** Batched on purpose: one itinerary needs a dozen lookups at once. */
  lookup(
    queries: readonly string[],
    options?: LookupOptions,
  ): Promise<Map<string, PlaceImage | null>>;
};

/** The bytes of one photograph, as held in the process cache. */
export type Photo = {
  body: ArrayBuffer;
  contentType: string;
};

/**
 * The three answers the photo route can give, which the client tells apart:
 * a photograph, one still on its way, and one Commons refused outright.
 */
export type PhotoResult =
  | ({ status: 'ok' } & Photo)
  /** Still coming. Worth asking again. */
  | { status: 'pending' }
  /** Commons refused it outright; asking again will not help. */
  | { status: 'failed' };

/** Author and licence for one Commons file, as the UI must display them. */
export type PhotoLicense = {
  credit: string;
  license: string;
  licenseUrl: string;
};

/** A search hit that survived filtering, before its licence is attached. */
export type ImageCandidate = {
  query: string;
  subject: string;
  pageUrl: string;
  url: string;
  width: number;
  height: number;
  fileName: string;
};
