import { imageProvider } from '@/features/photos/server';
import type { PlaceImage } from '@/features/photos/shared';
import { MAX_LOOKUP_QUERIES, MAX_LOOKUP_QUERY_LENGTH } from '@/features/photos/shared';
import { CacheControl, HttpStatus } from '@/lib/http';

/**
 * Looks up place photos for the client.
 *
 * The hotel and activity cards get their photos inside the tool call, but the
 * itinerary's cover and day headings are only known once the model has written
 * them, so those are fetched here after the fact.
 *
 * Takes `q` more than once, because asking for a screenful one request at a
 * time is much slower than it looks: outbound calls are spaced out to stay
 * inside Wikipedia's rate limit, so eight separate lookups pay that gap eight
 * times over and then eight more for their licences. Handed the whole set, the
 * provider spends one call per place and a single batched one on the licences.
 */

type LookupResponse = { images: Record<string, PlaceImage | null> };

function readQueries(params: URLSearchParams): string[] {
  return params
    .getAll('q')
    .map((query) => query.trim())
    .filter((query) => query.length > 0 && query.length <= MAX_LOOKUP_QUERY_LENGTH);
}

/**
 * The thumbnail width the caller wants, or undefined to let the provider choose.
 * A caller drawing thumbnails says so here rather than pulling a cover-sized
 * photo it will paint into a tile.
 */
function readWidth(params: URLSearchParams): number | undefined {
  const width = Number(params.get('w'));
  return Number.isFinite(width) && width > 0 ? width : undefined;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const queries = readQueries(params);

  if (queries.length === 0 || queries.length > MAX_LOOKUP_QUERIES) {
    return Response.json(
      { error: `Provide between one and ${MAX_LOOKUP_QUERIES} q parameters.` },
      { status: HttpStatus.BAD_REQUEST },
    );
  }

  try {
    const found = await imageProvider().lookup(queries, { width: readWidth(params) });

    // Keyed by the query the caller sent, including the ones that found nothing:
    // a client that asked about eight places should be able to tell "no photo"
    // from "still waiting".
    const body: LookupResponse = {
      images: Object.fromEntries(queries.map((query) => [query, found.get(query) ?? null])),
    };

    return Response.json(body, { headers: { 'Cache-Control': CacheControl.SHARED_DAY } });
  } catch {
    // A missing cover is a non-event; every caller falls back to its gradient.
    return Response.json({ images: {} } satisfies LookupResponse);
  }
}
