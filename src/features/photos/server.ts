import 'server-only';

/**
 * The pipeline itself: looking a place up on Commons, and serving its bytes.
 *
 * `server-only` is load-bearing rather than decorative. Importing this from a
 * client component is a build error, which is the guarantee the old single
 * barrel could not make — the rate limiters and caches here are process-wide
 * state that only means anything on one server, and a copy of them per browser
 * tab would quietly stop pacing anything at all.
 *
 * The rest of the internals stay unexported. Callers want a photograph or its
 * bytes; the negotiation with two upstream rate limits is nobody else's.
 */

export { fetchPlacePhoto } from './photo-proxy';
export { placePhotoUpstream } from './photo-url';
export { imageProvider } from './provider';
