import { SECONDS_PER_DAY, SECONDS_PER_HOUR, SECONDS_PER_YEAR } from './time';

/**
 * The caching contract each route answers with, stated in one place.
 *
 * These strings are the difference between a photograph fetched once and one
 * fetched per reader, so they are worth naming rather than inlining: a header
 * written out at the call site is a decision nobody reviews again.
 */
export const CacheControl = {
  /** A response that can never change, e.g. one rendering of one Commons revision. */
  IMMUTABLE: `public, max-age=${SECONDS_PER_YEAR}, immutable`,
  /**
   * Lookup answers. Short in the browser, long in a shared cache: several
   * travellers asking about the same city should hit one stored entry.
   */
  SHARED_DAY: `public, max-age=${SECONDS_PER_HOUR}, s-maxage=${SECONDS_PER_DAY}`,
  /** A transient failure. Storing it would answer for the resource after it recovered. */
  NONE: 'no-store',
} as const;

export const HttpStatus = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  GONE: 410,
  PAYLOAD_TOO_LARGE: 413,
  INTERNAL_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  TOO_MANY_REQUESTS: 429,
} as const;

/** Seconds a client is asked to wait before polling a pending resource again. */
export const RETRY_AFTER_SECONDS = '1';

/** Revalidation window for upstream content that is effectively static. */
export const UPSTREAM_REVALIDATE_SECONDS = SECONDS_PER_DAY;
