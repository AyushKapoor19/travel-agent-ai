import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GeocodedPlace } from './types';

/**
 * What the retry ladder does with a 429, which turns out to be three different
 * questions wearing one status code.
 *
 * Open-Meteo answers a momentary per-IP collision, a spent hourly allowance and a
 * spent daily allowance identically: HTTP 429, with the only distinguishing detail
 * in the body. The ladder was built for the first — four attempts over about
 * eleven seconds, which is exactly right for a queue that clears in a second — and
 * applied it to all three. Against a spent daily quota that is eleven seconds and
 * four more refused requests per place, for an answer the first response already
 * gave, and a five-candidate shortlist spent a minute arriving at nothing.
 *
 * Mocked at `fetch` rather than over HTTP, because the whole point is the requests
 * that should not be made, and counting those needs a stub. `sleep` is stubbed for
 * the same reason in reverse: the real ladder would make this file take a minute.
 */

vi.mock('@/lib/sleep', () => ({ sleep: () => Promise.resolve() }));

const ARCHIVE_ORIGIN = 'https://archive-api.open-meteo.com';
const GEOCODING_ORIGIN = 'https://geocoding-api.open-meteo.com';

const fetchMock = vi.fn<(url: string) => Promise<Response>>();

/** Open-Meteo's own wording, copied from a live response rather than paraphrased. */
function refusal(reason: string): Response {
  return new Response(JSON.stringify({ error: true, reason }), {
    status: 429,
    headers: { 'content-type': 'application/json' },
  });
}

const DAILY_SPENT = 'Daily API request limit exceeded. Please try again tomorrow.';
const MINUTELY_SPENT = 'Minutely API request limit exceeded. Please try again in one minute.';

function geocodingHit(): Response {
  return Response.json({
    results: [
      {
        name: 'Oaxaca City',
        latitude: 17.06,
        longitude: -96.72,
        country: 'Mexico',
        timezone: 'America/Mexico_City',
        population: 255_029,
      },
    ],
  });
}

const PLACE: GeocodedPlace = {
  name: 'Oaxaca City',
  country: 'Mexico',
  latitude: 17.06,
  longitude: -96.72,
  timezone: 'America/Mexico_City',
  population: 255_029,
};

/**
 * The latch is module state with no reset, deliberately — it is a fact about the
 * process's remaining allowance, not about a request. So each case gets its own
 * copy of the module rather than a way to clear it.
 */
async function freshTransport() {
  vi.resetModules();
  return import('./open-meteo');
}

function archiveCalls(): number {
  return fetchMock.mock.calls.filter(([url]) => url.startsWith(ARCHIVE_ORIGIN)).length;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  // The warning is the intended behaviour, and printing it eleven times would bury
  // a real failure in this file's output.
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('a spent daily allowance', () => {
  it('is believed the first time, rather than asked four more times', async () => {
    fetchMock.mockResolvedValue(refusal(DAILY_SPENT));
    const { fetchDailySeries } = await freshTransport();

    await expect(fetchDailySeries(PLACE, 2016, 2025)).rejects.toThrow(/allowance spent/);

    expect(archiveCalls()).toBe(1);
  });

  /*
   * The reason the latch exists at all. Without it every candidate in a shortlist
   * pays the full ladder over again, so the cost of an exhausted quota scales with
   * how many places the model proposed.
   */
  it('is remembered, so later places cost nothing at all', async () => {
    fetchMock.mockResolvedValue(refusal(DAILY_SPENT));
    const { fetchDailySeries } = await freshTransport();

    await expect(fetchDailySeries(PLACE, 2016, 2025)).rejects.toThrow(/allowance spent/);
    await expect(fetchDailySeries(PLACE, 2016, 2025)).rejects.toThrow(/allowance spent/);
    await expect(fetchDailySeries(PLACE, 2016, 2025)).rejects.toThrow(/allowance spent/);

    expect(archiveCalls()).toBe(1);
  });

  /*
   * The two endpoints are metered separately and were observed failing apart: the
   * archive refused every request on an afternoon when geocoding answered normally.
   * Latching them together would take place resolution down with the weather, which
   * is the one thing that still lets a shortlist come back.
   */
  it('does not take geocoding down with it', async () => {
    fetchMock.mockImplementation((url) =>
      Promise.resolve(url.startsWith(ARCHIVE_ORIGIN) ? refusal(DAILY_SPENT) : geocodingHit()),
    );
    const { fetchDailySeries, geocodePlace } = await freshTransport();

    await expect(fetchDailySeries(PLACE, 2016, 2025)).rejects.toThrow(/allowance spent/);
    const resolved = await geocodePlace('Oaxaca City', 'Mexico');

    expect(resolved.name).toBe('Oaxaca City');
    expect(fetchMock.mock.calls.some(([url]) => url.startsWith(GEOCODING_ORIGIN))).toBe(true);
  });
});

describe('an ordinary rate limit', () => {
  /*
   * The behaviour the ladder was written for, and the thing the fix above must not
   * cost. A minute's allowance or somebody else's in-flight request clears on its
   * own, and giving up on it would trade a weather line for nothing.
   */
  it('is still retried, because that one really does clear', async () => {
    fetchMock.mockResolvedValue(refusal(MINUTELY_SPENT));
    const { fetchDailySeries } = await freshTransport();

    await expect(fetchDailySeries(PLACE, 2016, 2025)).rejects.toThrow(/429/);

    expect(archiveCalls()).toBeGreaterThan(1);
  });

  it('gives up on a body it cannot read, rather than assuming the worst', async () => {
    fetchMock.mockResolvedValue(new Response('slow down', { status: 429 }));
    const { fetchDailySeries } = await freshTransport();

    await expect(fetchDailySeries(PLACE, 2016, 2025)).rejects.toThrow(/429/);

    expect(archiveCalls()).toBeGreaterThan(1);
  });

  it('succeeds on a retry when the queue clears', async () => {
    fetchMock.mockResolvedValueOnce(refusal(MINUTELY_SPENT)).mockResolvedValueOnce(
      Response.json({
        daily: {
          time: ['2020-07-15'],
          temperature_2m_max: [31],
          temperature_2m_min: [19],
          precipitation_sum: [2],
        },
      }),
    );
    const { fetchDailySeries } = await freshTransport();

    const series = await fetchDailySeries(PLACE, 2016, 2025);

    expect(series.time).toEqual(['2020-07-15']);
    expect(archiveCalls()).toBe(2);
  });
});
