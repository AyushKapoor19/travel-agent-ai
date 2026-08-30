import 'server-only';

import { type BackoffLimits, exponentialBackoff } from '@/lib/http-retry';
import { createStartStagger } from '@/lib/request-pacing';
import { sleep } from '@/lib/sleep';

import {
  API_BACKOFF_BASE_MS,
  API_BACKOFF_MAX_MS,
  API_RETRIES,
  API_TIMEOUT_MS,
  MIN_REQUEST_GAP_MS,
  type SerpApiEngineName,
} from './constants';
import { MissingSerpApiKeyError } from './errors/missing-serp-api-key-error';
import { SerpApiAuthError } from './errors/serp-api-auth-error';
import { SerpApiQuotaError } from './errors/serp-api-quota-error';
import { TransientSerpApiError } from './errors/transient-serp-api-error';
import { Outcome, vendorFor, type VendorSpec } from './vendors';

/**
 * The one way this app talks to a search vendor.
 *
 * Four engines, one transport: the key, the pacing, the retries and the
 * quota/blip/refusal split live here, so there is a single place that knows the
 * allowance is finite. Callers above deal in destinations and dates, and none of
 * them knows which vendor answered — the URL shape and the status-code meanings
 * are the vendor's business, described in `vendors.ts`.
 */

/**
 * Read at call time rather than at module load, so a probe script that sources
 * its environment after import still works, and so a missing key is a clear error
 * from the call that needed it rather than a crash on first import.
 */
function apiKey(vendor: VendorSpec): string {
  const key = process.env[vendor.keyEnv]?.trim();
  if (!key) throw new MissingSerpApiKeyError(vendor.keyEnv, vendor.signupUrl);
  return key;
}

/**
 * Starts only — calls still overlap, because neither vendor holds a per-IP slot
 * the way Open-Meteo does.
 */
const takeTurn = createStartStagger(MIN_REQUEST_GAP_MS);

const BACKOFF: BackoffLimits = { baseMs: API_BACKOFF_BASE_MS, maxMs: API_BACKOFF_MAX_MS };

/**
 * Calls one engine and returns raw JSON, unvalidated — callers own their schema,
 * because the four engines share nothing but the transport.
 *
 * Returns `null` when the upstream succeeded but had nothing to report, so a
 * caller can cache that emptiness instead of asking again.
 *
 * @throws SerpApiQuotaError when the allowance is spent.
 * @throws SerpApiAuthError when the key is rejected.
 * @throws TransientSerpApiError on a timeout, throttle or server blip, so the
 * caller can decline to cache the outcome.
 */
export async function serpApiSearch(
  engine: SerpApiEngineName,
  params: Readonly<Record<string, string>>,
): Promise<unknown | null> {
  // Per engine, not per process: the chosen vendor may not cover this surface.
  const vendor = vendorFor(engine);
  const url = vendor.requestUrl(engine, params, apiKey(vendor));

  for (let attempt = 0; ; attempt += 1) {
    await takeTurn();

    let response: Response;

    try {
      response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
        // These are prices. The process cache above is the single source of
        // freshness; letting the platform hold a copy for a day as well would
        // serve last night's nightly rate as today's.
        cache: 'no-store',
      });
    } catch (cause) {
      if (attempt >= API_RETRIES) {
        throw new TransientSerpApiError(`${vendor.label} ${engine} unreachable: ${String(cause)}`);
      }
      await sleep(exponentialBackoff(attempt, BACKOFF));
      continue;
    }

    // The body carries the reason even on a failed status, and on 200 it is the
    // only place a refusal appears at all.
    const body: unknown = await response.json().catch(() => null);
    const stated = errorFrom(body);

    switch (vendor.classify(response.status, stated)) {
      case Outcome.OK:
        // Into the field names the callers' schemas are written against, so no
        // schema below this line knows which vendor answered.
        return vendor.normalize(engine, body);

      case Outcome.EMPTY:
        return null;

      case Outcome.AUTH:
        throw new SerpApiAuthError(
          vendor.label,
          vendor.keyEnv,
          stated ?? `HTTP ${response.status}`,
        );

      case Outcome.QUOTA:
        throw new SerpApiQuotaError(vendor.label, stated ?? `HTTP ${response.status}`);

      case Outcome.TRANSIENT: {
        if (attempt >= API_RETRIES) {
          throw new TransientSerpApiError(describe(vendor, engine, response.status, stated));
        }
        await sleep(exponentialBackoff(attempt, BACKOFF));
        continue;
      }

      default:
        throw new Error(describe(vendor, engine, response.status, stated));
    }
  }
}

function describe(
  vendor: VendorSpec,
  engine: SerpApiEngineName,
  status: number,
  stated: string | null,
): string {
  return `${vendor.label} ${engine} ${status}${stated ? `: ${stated}` : ''}`;
}

/** Both vendors state a refusal in `error`, on failed and 200 responses alike. */
function errorFrom(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const { error } = body as { error?: unknown };
  return typeof error === 'string' && error.length > 0 ? error : null;
}
