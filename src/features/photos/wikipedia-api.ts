import { HttpStatus, UPSTREAM_REVALIDATE_SECONDS } from '@/lib/http';
import { sleep } from '@/lib/sleep';
import { MS_PER_SECOND } from '@/lib/time';

import {
  API_BACKOFF_BASE_MS,
  API_BACKOFF_MAX_MS,
  API_RETRIES,
  API_TIMEOUT_MS,
  MIN_REQUEST_GAP_MS,
  USER_AGENT,
  WIKIPEDIA_API_URL,
} from './constants';
import { TransientImageError } from './errors';

/**
 * The one way this app talks to Wikipedia.
 *
 * Everything above it — search, licences — is a set of query parameters; the
 * pacing, the retries and the transient/permanent distinction belong here, so
 * there is exactly one place that knows the rate limit exists.
 */

/**
 * Spaces out the start of every outbound call, process-wide.
 *
 * Callers still run concurrently; only their request starts are staggered,
 * which keeps a dozen lookups well inside the rate limit without serialising
 * the whole batch behind each round trip.
 */
let requestChain: Promise<void> = Promise.resolve();

function takeTurn(): Promise<void> {
  const turn = requestChain.then(() => sleep(MIN_REQUEST_GAP_MS));
  requestChain = turn.catch(() => {});
  return turn;
}

/** A status that says "later", as opposed to one that says "no". */
function isRetryable(status: number): boolean {
  return status === HttpStatus.TOO_MANY_REQUESTS || status >= HttpStatus.INTERNAL_ERROR;
}

function backoffFor(response: Response, attempt: number): number {
  const retryAfter = Number(response.headers.get('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * MS_PER_SECOND, API_BACKOFF_MAX_MS);
  }
  return API_BACKOFF_BASE_MS * 2 ** attempt;
}

/**
 * Calls the API and returns the raw JSON, unvalidated — callers own their own
 * response schema, because the two endpoints share nothing but the transport.
 *
 * @throws TransientImageError when the failure is a rate limit or a server blip,
 * so a caller can decline to cache the outcome.
 */
export async function callWikipedia(params: Record<string, string>): Promise<unknown> {
  const url = `${WIKIPEDIA_API_URL}?${new URLSearchParams({
    format: 'json',
    formatversion: '2',
    ...params,
  })}`;

  for (let attempt = 0; ; attempt += 1) {
    await takeTurn();

    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
      // Wikimedia content is stable; let the platform cache it for a day.
      next: { revalidate: UPSTREAM_REVALIDATE_SECONDS },
    });

    if (response.ok) return response.json();

    const retryable = isRetryable(response.status);
    if (!retryable || attempt >= API_RETRIES) {
      const message = `Wikipedia API ${response.status}`;
      throw retryable ? new TransientImageError(message) : new Error(message);
    }

    await sleep(backoffFor(response, attempt));
  }
}
