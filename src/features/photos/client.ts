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

/**
 * Looks up photographs for a set of places.
 *
 * Batched in one request on purpose: the server spaces out its calls to
 * Wikipedia to stay inside the rate limit, so eight separate lookups queue
 * behind each other and the last one waits on the seven in front of it.
 *
 * Every result is re-validated, and anything that fails validation is simply
 * absent from the returned record — a caller draws its gradient instead. A
 * missing photograph is never worth failing a screen over.
 */
export async function fetchPlaceImages(
  queries: readonly string[],
  { width, signal }: FetchPlaceImagesOptions = {},
): Promise<Record<string, PlaceImage>> {
  if (queries.length === 0) return {};

  const params = new URLSearchParams(queries.map((query) => ['q', query]));
  if (width !== undefined) params.set('w', String(width));

  const response = await fetch(`${PhotoRoute.LOOKUP}?${params}`, { signal });
  if (!response.ok) return {};

  const body: unknown = await response.json();
  const images = (body as { images?: Record<string, unknown> } | null)?.images ?? {};

  const found: Record<string, PlaceImage> = {};
  for (const query of queries) {
    const parsed = placeImageSchema.safeParse(images[query]);
    if (parsed.success) found[query] = parsed.data;
  }

  return found;
}
