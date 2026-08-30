import { fetchPlacePhoto, placePhotoUpstream } from '@/features/photos/server';
import { CacheControl, HttpStatus, RETRY_AFTER_SECONDS } from '@/lib/http';

/**
 * Serves one Commons photograph.
 *
 * Commons refuses a caller who asks for too many at once, and neither a browser
 * nor the image optimizer will ask a second time — which is why a batch of eight
 * used to come up half empty. Everything goes through here so there is one
 * place that knows how to wait and try again, and so a reader's browser never
 * talks to Commons at all.
 *
 * The three answers are meant to be told apart. A photograph we have is
 * immutable, because a Commons thumbnail URL names one rendering of one revision
 * and can never come back different. A photograph still on its way is a 503 with
 * a `retry-after`, which is the tile's cue to ask again in a moment rather than
 * give up — and by then the fetch it was waiting on has almost always landed.
 * Anything else is a plain refusal, and the tile keeps its gradient.
 */
export async function GET(request: Request) {
  const upstream = placePhotoUpstream(new URL(request.url).searchParams.get('u'));

  if (!upstream) {
    return new Response('Provide a u parameter naming a Wikimedia Commons file.', {
      status: HttpStatus.BAD_REQUEST,
    });
  }

  const result = await fetchPlacePhoto(upstream);

  if (result.status === 'ok') {
    return new Response(result.body, {
      headers: {
        'Content-Type': result.contentType,
        'Cache-Control': CacheControl.IMMUTABLE,
      },
    });
  }

  const pending = result.status === 'pending';

  // Never cached: a refusal is about this moment, and storing it would answer
  // for the photograph long after it became available.
  const headers: Record<string, string> = { 'Cache-Control': CacheControl.NONE };
  if (pending) headers['Retry-After'] = RETRY_AFTER_SECONDS;

  return new Response(null, {
    status: pending ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.BAD_GATEWAY,
    headers,
  });
}
