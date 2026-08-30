/**
 * A timeout, a throttle or a server blip: worth retrying, and never worth caching.
 *
 * The base case of the four ways a search-vendor call fails. Its siblings —
 * `SerpApiQuotaError`, `SerpApiAuthError` and `MissingSerpApiKeyError` — are each
 * kept apart from it because the caller does something different with each, and
 * deliberately none of them extend this one.
 */
export class TransientSerpApiError extends Error {
  override readonly name = 'TransientSerpApiError';
}
