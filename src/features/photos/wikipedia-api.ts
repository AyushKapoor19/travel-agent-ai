import { UPSTREAM_REVALIDATE_SECONDS } from '@/lib/http';
import { backoffForResponse, type BackoffLimits, isRetryableStatus } from '@/lib/http-retry';
import { createStartStagger } from '@/lib/request-pacing';
import { sleep } from '@/lib/sleep';

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
 * Wikipedia throttles by rate rather than by concurrency, so staggering the
 * starts is enough — a dozen lookups stay inside the limit without queueing the
 * whole batch behind each round trip.
 */
const takeTurn = createStartStagger(MIN_REQUEST_GAP_MS);

const BACKOFF: BackoffLimits = { baseMs: API_BACKOFF_BASE_MS, maxMs: API_BACKOFF_MAX_MS };

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

    const retryable = isRetryableStatus(response.status);
    if (!retryable || attempt >= API_RETRIES) {
      const message = `Wikipedia API ${response.status}`;
      throw retryable ? new TransientImageError(message) : new Error(message);
    }

    await sleep(backoffForResponse(response, attempt, BACKOFF));
  }
}
