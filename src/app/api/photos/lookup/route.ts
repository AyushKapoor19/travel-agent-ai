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

/**
 * `images` holds an answer for every query that got one, null included — null
 * means the place has no usable photograph and is worth remembering. `pending`
 * holds the ones Wikipedia declined to answer, which is a fact about this
 * moment rather than about the place, so the caller is expected to ask again.
 *
 * Answering a throttled lookup with null was the bug this replaces: the client
 * could not tell it apart from a real miss, so a day that happened to land in a
 * rate-limited burst kept its gradient for the life of the page.
 */
type LookupResponse = {
  images: Record<string, PlaceImage | null>;
  pending: string[];
};

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

    const images: Record<string, PlaceImage | null> = {};
    const pending: string[] = [];

    for (const query of queries) {
      if (found.has(query)) images[query] = found.get(query) ?? null;
      else pending.push(query);
    }

    return Response.json({ images, pending } satisfies LookupResponse, {
      // A response holding a query we could not answer must not be stored, or
      // the retry it is asking for is served the same shrug it just got.
      headers: {
        'Cache-Control': pending.length > 0 ? CacheControl.NONE : CacheControl.SHARED_DAY,
      },
    });
  } catch {
    // Nothing about the places, so nothing is claimed about them: every query
    // comes back pending and the caller decides whether to try again.
    return Response.json({ images: {}, pending: queries } satisfies LookupResponse, {
      headers: { 'Cache-Control': CacheControl.NONE },
    });
  }
}
