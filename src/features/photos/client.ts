import { MAX_LOOKUP_QUERIES } from './constants';
import { PhotoRoute } from './routes';
import type { PlaceImage } from './types';
import { placeImageSchema } from './types';

/**
 * The client half of the lookup route.
 *
 * One place that knows the endpoint's shape, because two surfaces call it for
 * different reasons — a single cover photo, and a set of eight at once — and
 * they had a copy each of the same fetch, the same optional parse and the same
 * decision to swallow failures.
 */

export type FetchPlaceImagesOptions = {
  /** Source width to request. Worth setting for anything drawn small. */
  width?: number;
  signal?: AbortSignal;
};

export type PlaceImageLookup = {
  /** Every query that got an answer. A query with no photograph is simply absent. */
  images: Record<string, PlaceImage>;
  /**
   * Queries Wikipedia declined to answer, which is not the same as places with
   * no photograph. Worth asking again; the hooks do.
   */
  pending: string[];
};

/** Splits a set too large for one request into ones that fit. */
function chunk(queries: readonly string[]): string[][] {
  const chunks: string[][] = [];
  for (let start = 0; start < queries.length; start += MAX_LOOKUP_QUERIES) {
    chunks.push(queries.slice(start, start + MAX_LOOKUP_QUERIES));
  }
  return chunks;
}

async function fetchChunk(
  queries: string[],
  { width, signal }: FetchPlaceImagesOptions,
): Promise<PlaceImageLookup> {
  const params = new URLSearchParams(queries.map((query) => ['q', query]));
  if (width !== undefined) params.set('w', String(width));

  const response = await fetch(`${PhotoRoute.LOOKUP}?${params}`, { signal });

  // The route answers its own upstream failures with a 200 and a pending list,
  // so a non-ok here is us rather than Wikipedia — a malformed request, which
  // asking again would only repeat.
  if (!response.ok) return { images: {}, pending: [] };

  const body: unknown = await response.json();
  const payload = body as { images?: Record<string, unknown>; pending?: unknown } | null;

  // Every result is re-validated, and anything that fails validation is simply
  // absent from the returned record — a caller draws its gradient instead. A
  // missing photograph is never worth failing a screen over.
  const images: Record<string, PlaceImage> = {};
  for (const query of queries) {
    const parsed = placeImageSchema.safeParse(payload?.images?.[query]);
    if (parsed.success) images[query] = parsed.data;
  }

  const pending = Array.isArray(payload?.pending)
    ? payload.pending.filter((query): query is string => typeof query === 'string')
    : [];

  return { images, pending };
}

/**
 * Looks up photographs for a set of places.
 *
 * Batched in one request on purpose: the server spaces out its calls to
 * Wikipedia to stay inside the rate limit, so eight separate lookups queue
 * behind each other and the last one waits on the seven in front of it. Each
 * one also pays for its own licence call, which the batch spends once.
 *
 * Deduplicated, because two days of a trip regularly point at the same place,
 * and split into request-sized pieces rather than rejected, because a
 * three-week itinerary is a legitimate caller and losing every photograph past
 * the sixteenth is not a reasonable answer to it.
 */
export async function fetchPlaceImages(
  queries: readonly string[],
  options: FetchPlaceImagesOptions = {},
): Promise<PlaceImageLookup> {
  const unique = [...new Set(queries)];
  if (unique.length === 0) return { images: {}, pending: [] };

  const results = await Promise.all(chunk(unique).map((part) => fetchChunk(part, options)));

  return {
    images: Object.assign({}, ...results.map((result) => result.images)) as Record<
      string,
      PlaceImage
    >,
    pending: results.flatMap((result) => result.pending),
  };
}
