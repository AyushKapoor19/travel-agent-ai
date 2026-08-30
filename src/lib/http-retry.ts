import { HttpStatus } from './http';
import { MS_PER_SECOND } from './time';

/**
 * When to try an HTTP call again, and how long to wait first.
 *
 * The three upstreams this app talks to disagree about almost everything —
 * timeouts, retry counts, whether they throttle by rate or by concurrency — but
 * they agree entirely about this part, and each had its own copy. One of the
 * copies had already lost the ceiling from its exponential branch while keeping
 * it on the branch beside it, which is the failure mode duplicated arithmetic has:
 * not a wrong answer, a differently-wrong answer in one place nobody compares.
 *
 * The limits stay with the caller, because those are genuinely per-upstream.
 */

/** Per-upstream bounds on how long a backoff is allowed to grow. */
export type BackoffLimits = {
  /** The first wait. Each subsequent attempt doubles it. */
  readonly baseMs: number;
  /** The ceiling, applied to every branch below. */
  readonly maxMs: number;
};

/** A status that says "later", as opposed to one that says "no". */
export function isRetryableStatus(status: number): boolean {
  return status === HttpStatus.TOO_MANY_REQUESTS || status >= HttpStatus.INTERNAL_ERROR;
}

/** Doubling, capped. `attempt` is zero-based, so the first wait is `baseMs`. */
export function exponentialBackoff(attempt: number, limits: BackoffLimits): number {
  return Math.min(limits.baseMs * 2 ** attempt, limits.maxMs);
}

/**
 * The server's own answer to "when should I come back", when it gives one, and
 * the doubling curve when it does not.
 *
 * `Retry-After` is capped too: a server asking for an hour is not a wait worth
 * holding a request open for.
 */
export function backoffForResponse(
  response: Response,
  attempt: number,
  limits: BackoffLimits,
): number {
  const retryAfter = Number(response.headers.get('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * MS_PER_SECOND, limits.maxMs);
  }

  return exponentialBackoff(attempt, limits);
}
