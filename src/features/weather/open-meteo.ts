import 'server-only';

import { sameCountry } from '@/lib/countries';
import { HttpStatus, UPSTREAM_REVALIDATE_SECONDS } from '@/lib/http';
import {
  backoffForResponse,
  type BackoffLimits,
  exponentialBackoff,
  isRetryableStatus,
} from '@/lib/http-retry';
import { createRequestSerializer } from '@/lib/request-pacing';
import { sleep } from '@/lib/sleep';
import { MS_PER_HOUR } from '@/lib/time';

import {
  API_BACKOFF_BASE_MS,
  API_BACKOFF_MAX_MS,
  API_RETRIES,
  API_TIMEOUT_MS,
  ARCHIVE_API_URL,
  GEOCODING_API_URL,
  MAX_PLACE_NAME_LENGTH,
  MIN_REQUEST_GAP_MS,
  USER_AGENT,
} from './constants';
import { QuotaExhaustedError } from './errors/quota-exhausted-error';
import { TransientWeatherError } from './errors/transient-weather-error';
import { UnknownPlaceError } from './errors/unknown-place-error';
import type { GeocodedPlace } from './types';
import { archiveResponseSchema, geocodingResponseSchema } from './types';

/**
 * The one way this app talks to Open-Meteo.
 *
 * Two endpoints, one transport: the pacing, the retries and the
 * transient/permanent split live here so there is a single place that knows the
 * rate limit exists. Callers above deal in places and months.
 */

/**
 * One outbound call at a time, process-wide.
 *
 * The free tier permits exactly one concurrent request per IP: a second runs
 * behind the first, and past five queued the rest are refused outright. This is
 * therefore a mutex rather than the start-stagger the image pipeline uses — each
 * call waits for its predecessor to *finish*, not merely to begin, because
 * staggered starts still put four requests in one slot.
 *
 * Learned the hard way: a four-way pool asking about five candidates returned two
 * climates and three 429s, and because a 429 is a soft failure the two survivors
 * looked like a complete answer.
 */
const serialize = createRequestSerializer(MIN_REQUEST_GAP_MS);

const BACKOFF: BackoffLimits = { baseMs: API_BACKOFF_BASE_MS, maxMs: API_BACKOFF_MAX_MS };

/* -------------------------------------------------------------------------- */
/* Spent allowances                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Open-Meteo caps requests per minute, per hour and per day, and answers all
 * three the same way: a bare 429. The retry ladder above is built for the first
 * of them — a collision with somebody else's in-flight request, gone in a second
 * or two — and for the other two it is worse than useless. It cannot outlast
 * either window, every attempt it makes is itself refused, and the caller waits
 * out the full ladder to be told what the first response already said.
 *
 * Which window was hit is stated only in the body, so that is what gets read.
 * The two windows a ladder can never wait out are latched instead: the endpoint
 * is treated as spent until the window rolls over, and calls fail immediately
 * rather than queueing behind a mutex to be refused one at a time.
 *
 * This is not a hypothetical. A shortlist of five candidates against an exhausted
 * daily quota spent about a minute in backoff and made twenty more refused
 * requests, and every candidate came back "unavailable" — which reads on screen
 * as "I wasn't able to check options in Mexico just now", with nothing anywhere
 * saying the allowance had simply run out.
 */
const QUOTA_WINDOWS = [
  { name: 'daily', pattern: /\bdaily\b/i, rollsOver: nextUtcMidnight },
  { name: 'hourly', pattern: /\bhourly\b/i, rollsOver: nextUtcHour },
] as const;

function nextUtcMidnight(now: number): number {
  const at = new Date(now);
  return Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate() + 1);
}

function nextUtcHour(now: number): number {
  return Math.floor(now / MS_PER_HOUR + 1) * MS_PER_HOUR;
}

/**
 * Keyed by origin, because the two endpoints are metered separately and observably
 * fail apart: on the afternoon the archive was refusing every request, geocoding
 * answered normally. Latching them together would take out place resolution too,
 * which is the one thing that still lets a shortlist come back at all.
 */
const spentUntil = new Map<string, number>();

function spentFor(origin: string, now: number): number | null {
  const until = spentUntil.get(origin);
  if (until === undefined) return null;

  if (now >= until) {
    spentUntil.delete(origin);
    return null;
  }

  return until;
}

/** The window this 429 named, or null if it was the kind worth retrying. */
async function longWindowFrom(response: Response, now: number) {
  // Cloned rather than read, so a body we decide not to classify is still intact
  // for anything downstream that wants it.
  const reason = await response
    .clone()
    .text()
    .catch(() => '');
  if (!/limit/i.test(reason)) return null;

  const window = QUOTA_WINDOWS.find(({ pattern }) => pattern.test(reason));
  return window ? { name: window.name, until: window.rollsOver(now) } : null;
}

/**
 * Calls an endpoint and returns raw JSON, unvalidated — callers own their schema,
 * because the two endpoints share nothing but the transport.
 *
 * Only the fetch itself holds the mutex. Backing off outside it matters: sleeping
 * with the turn still held would idle the one slot every other caller is waiting
 * for, turning one rate-limited place into a stalled batch.
 *
 * @throws TransientWeatherError on a rate limit or server blip, so the caller can
 * decline to cache the outcome.
 * @throws QuotaExhaustedError when the day's or hour's allowance is spent, which
 * is the same kind of failure and not worth another request.
 */
async function call(url: string, label: string): Promise<unknown> {
  const { origin } = new URL(url);

  for (let attempt = 0; ; attempt += 1) {
    const spent = spentFor(origin, Date.now());
    if (spent !== null) {
      throw new QuotaExhaustedError(
        `${label} allowance spent until ${new Date(spent).toISOString()}`,
      );
    }

    let response: Response;

    try {
      response = await serialize(() =>
        fetch(url, {
          headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
          signal: AbortSignal.timeout(API_TIMEOUT_MS),
          // Climate normals over a closed window are as static as data gets.
          next: { revalidate: UPSTREAM_REVALIDATE_SECONDS },
        }),
      );
    } catch (cause) {
      // A timeout or a dropped connection is the definition of "try again", but
      // only while there are attempts left to try with.
      if (attempt >= API_RETRIES) {
        throw new TransientWeatherError(`${label} unreachable: ${String(cause)}`);
      }
      await sleep(exponentialBackoff(attempt, BACKOFF));
      continue;
    }

    if (response.ok) return response.json();

    if (response.status === HttpStatus.TOO_MANY_REQUESTS) {
      const now = Date.now();
      const window = await longWindowFrom(response, now);

      if (window) {
        spentUntil.set(origin, window.until);
        // The one thing worth printing from this module. Without it an exhausted
        // allowance is indistinguishable from an outage at every layer above:
        // the shortlist reports "unavailable", the model apologises, and nothing
        // says the quota simply ran out or when it comes back.
        console.warn(
          `${label}: ${window.name} request allowance exhausted; skipping until ${new Date(window.until).toISOString()}`,
        );
        throw new QuotaExhaustedError(
          `${label} allowance spent until ${new Date(window.until).toISOString()}`,
        );
      }
    }

    const retryable = isRetryableStatus(response.status);
    if (!retryable || attempt >= API_RETRIES) {
      const message = `${label} ${response.status}`;
      throw retryable ? new TransientWeatherError(message) : new Error(message);
    }

    await sleep(backoffForResponse(response, attempt, BACKOFF));
  }
}

/**
 * Enough candidates for the right one to be in the list.
 *
 * Open-Meteo's index holds every hamlet and administrative division sharing a
 * name with somewhere famous, ordered by its own relevance rather than by size,
 * and the famous one is regularly not first: "Bali" returns a town in Rajasthan
 * ahead of the Indonesian island.
 */
const GEOCODING_CANDIDATES = 10;

/**
 * Biggest match wins, across every kind of place.
 *
 * Filtering to populated places first is the obvious move and it is wrong: Bali
 * and Santorini are both indexed as islands, so a settlements-only filter throws
 * away the correct answer and confidently returns a Rajasthani town or a Mexican
 * neighbourhood instead. Population is the better discriminator precisely because
 * it is type-blind — the Indonesian island's four million beats every namesake,
 * and an airport or a park carries no population to win with.
 *
 * Ties keep the geocoder's own ordering, since `>` never displaces an equal.
 */
function largestPlace<T extends { population?: number | undefined }>(candidates: T[]): T {
  return candidates.reduce((chosen, candidate) =>
    (candidate.population ?? 0) > (chosen.population ?? 0) ? candidate : chosen,
  );
}

/**
 * A place name resolved to a point, optionally confirmed against a country.
 *
 * The hint is how this stays honest about the places it cannot resolve. Vague
 * regions are simply absent from the index — "Tuscany" offers a suburb in Calgary
 * and "Patagonia" a town of 890 in Arizona — and without a country to check
 * against, both come back looking like successes. With one, a name the index
 * cannot place in the right country raises rather than resolving, and the caller
 * shows no weather instead of the weather in Arizona.
 *
 * @throws UnknownPlaceError when nothing matches, or nothing matches the country.
 */
export async function geocodePlace(place: string, countryHint?: string): Promise<GeocodedPlace> {
  const query = place.trim().slice(0, MAX_PLACE_NAME_LENGTH);
  if (!query) throw new UnknownPlaceError(place);

  const url = `${GEOCODING_API_URL}?${new URLSearchParams({
    name: query,
    count: String(GEOCODING_CANDIDATES),
    language: 'en',
    format: 'json',
  })}`;

  const parsed = geocodingResponseSchema.safeParse(await call(url, 'Open-Meteo geocoding'));
  if (!parsed.success) throw new Error('Open-Meteo geocoding returned an unexpected shape');

  const results = parsed.data.results ?? [];
  if (results.length === 0) throw new UnknownPlaceError(place);

  const inCountry = countryHint
    ? results.filter((result) => sameCountry(result.country, countryHint))
    : results;

  if (inCountry.length === 0) throw new UnknownPlaceError(`${place}, ${countryHint ?? ''}`);

  const best = largestPlace(inCountry);

  return {
    name: best.name,
    country: best.country ?? '',
    latitude: best.latitude,
    longitude: best.longitude,
    timezone: best.timezone ?? 'UTC',
    population: best.population ?? null,
  };
}

export type DailySeries = {
  readonly time: readonly string[];
  readonly highC: readonly (number | null)[];
  readonly lowC: readonly (number | null)[];
  readonly precipitationMm: readonly (number | null)[];
};

/**
 * Every observed day in the window, in one request.
 *
 * A decade of three variables is about 100 kB and arrives in roughly a second,
 * which is cheaper than twelve month-shaped requests and is the whole reason the
 * aggregation happens here rather than upstream: the archive has no monthly
 * endpoint, so somebody has to average, and doing it once per place beats doing
 * it once per month.
 */
export async function fetchDailySeries(
  place: GeocodedPlace,
  fromYear: number,
  toYear: number,
): Promise<DailySeries> {
  const url = `${ARCHIVE_API_URL}?${new URLSearchParams({
    latitude: place.latitude.toFixed(4),
    longitude: place.longitude.toFixed(4),
    start_date: `${fromYear}-01-01`,
    end_date: `${toYear}-12-31`,
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum',
    timezone: 'UTC',
  })}`;

  const parsed = archiveResponseSchema.safeParse(await call(url, 'Open-Meteo archive'));
  if (!parsed.success) throw new Error('Open-Meteo archive returned an unexpected shape');

  const { daily } = parsed.data;
  return {
    time: daily.time,
    highC: daily.temperature_2m_max,
    lowC: daily.temperature_2m_min,
    precipitationMm: daily.precipitation_sum,
  };
}
