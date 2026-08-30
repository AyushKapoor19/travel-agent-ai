/**
 * What a photograph is, on either side of the wire.
 *
 * Everything here is safe in a browser bundle: the shape of a result, the credit
 * line a card prints, and the bounds the lookup route enforces. Nothing in it can
 * reach Wikipedia.
 *
 * Narrower than the feature's internals on purpose — this is only what crosses
 * the boundary. Code inside the feature imports `./credit` or `./photo-url`
 * directly, and code outside it draws a photograph with `<PlacePhoto>` rather
 * than assembling a URL itself.
 *
 * That is the entire reason this file exists rather than one barrel. The
 * pipeline's internals — two caches, a semaphore, a rate-limit cool-off and the
 * outbound calls themselves — belong to the server, and a single barrel
 * exporting both surfaces meant a card importing a *type* pulled the fetching
 * code into its module graph and nothing but tree-shaking stopped it shipping.
 * Anything a component needs is here; anything else is in `./server`, which a
 * client component cannot import at all.
 */

export { MAX_LOOKUP_QUERIES, MAX_LOOKUP_QUERY_LENGTH } from './constants';
export { photoCreditTitle } from './credit';
export type { PlaceImage } from './types';
export { placeImageSchema } from './types';
