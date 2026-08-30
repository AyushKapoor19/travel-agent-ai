import { describe, expect, it, vi } from 'vitest';

import type { DailySeries } from './open-meteo';
import type { GeocodedPlace } from './types';

/**
 * The two ways a place can come back without a climate, which are not the same way.
 *
 * This split is the whole subject of the file. A caller handed one null for both
 * has to describe them with one sentence, and the only sentence covering "we could
 * not reach the archive" and "nobody can find that place" is a claim about the
 * place — which is how a live shortlist came to tell a traveller that Rome, Athens
 * and Dubrovnik could not be verified, on an afternoon when the only thing wrong
 * was Open-Meteo's daily quota.
 *
 * Mocked at the transport rather than over HTTP: the question here is what the
 * layer above does with a failure, and a test that has to exhaust a real rate limit
 * to ask it would be neither fast nor repeatable.
 */

const geocodePlace = vi.fn<(place: string, country?: string) => Promise<GeocodedPlace>>();
const fetchDailySeries = vi.fn<() => Promise<DailySeries>>();

vi.mock('./open-meteo', () => ({
  geocodePlace: (place: string, country?: string) => geocodePlace(place, country),
  fetchDailySeries: () => fetchDailySeries(),
}));

const { weatherProvider } = await import('./climate');
const { TransientWeatherError, UnknownPlaceError } = await import('./errors');

function place(name: string): GeocodedPlace {
  return {
    name,
    country: 'Italy',
    latitude: 41.9,
    longitude: 12.5,
    timezone: 'Europe/Rome',
    population: 2_000_000,
  };
}

/**
 * One observed day, which is all the aggregation needs to return twelve months.
 * The numbers are never asserted on; `normals.test.ts` owns the averaging.
 */
const ONE_DAY: DailySeries = {
  time: ['2020-07-15'],
  highC: [31],
  lowC: [19],
  precipitationMm: [2],
};

/*
 * Every test names its own city. The cache is process-wide and deliberately has no
 * reset, so sharing a name between two cases would have one answering the other.
 */

describe('an archive that will not answer', () => {
  it('is reported as unavailable rather than as a place nobody can find', async () => {
    geocodePlace.mockResolvedValueOnce(place('Ostia'));
    fetchDailySeries.mockRejectedValueOnce(new TransientWeatherError('Open-Meteo archive 429'));

    const batch = await weatherProvider().climateForMany([{ name: 'Ostia', country: 'Italy' }]);

    expect(batch.found.size).toBe(0);
    expect(batch.unavailable.has('Ostia')).toBe(true);
  });

  /*
   * The half that makes the label worth having. A rate limit passes, so remembering
   * it would answer for the place long after the archive recovered — and the miss
   * cache is the one place that would quietly outlive the outage.
   */
  it('is not remembered, so the next attempt tries again', async () => {
    geocodePlace.mockResolvedValueOnce(place('Tivoli'));
    fetchDailySeries.mockRejectedValueOnce(new TransientWeatherError('Open-Meteo archive 429'));

    await weatherProvider().climateForMany([{ name: 'Tivoli', country: 'Italy' }]);

    geocodePlace.mockResolvedValueOnce(place('Tivoli'));
    fetchDailySeries.mockResolvedValueOnce(ONE_DAY);

    const retry = await weatherProvider().climateForMany([{ name: 'Tivoli', country: 'Italy' }]);

    expect(retry.unavailable.size).toBe(0);
    expect(retry.found.get('Tivoli')?.months).toHaveLength(12);
  });

  it('reports an unexpected payload the same way, since that is also our fault', async () => {
    geocodePlace.mockResolvedValueOnce(place('Anzio'));
    fetchDailySeries.mockRejectedValueOnce(new Error('archive returned an unexpected shape'));

    const batch = await weatherProvider().climateForMany([{ name: 'Anzio', country: 'Italy' }]);

    expect(batch.unavailable.has('Anzio')).toBe(true);
  });
});

describe('a place the geocoder rejects', () => {
  it('is not reported as unavailable, because that is a fact about the place', async () => {
    geocodePlace.mockRejectedValueOnce(new UnknownPlaceError('Atlantis'));

    const batch = await weatherProvider().climateForMany([{ name: 'Atlantis', country: 'Italy' }]);

    expect(batch.found.size).toBe(0);
    expect(batch.unavailable.size).toBe(0);
  });

  it('is remembered, so a name that does not exist is not looked up twice', async () => {
    geocodePlace.mockRejectedValueOnce(new UnknownPlaceError('Hyperborea'));

    await weatherProvider().climateForMany([{ name: 'Hyperborea', country: 'Italy' }]);
    const callsAfterFirst = geocodePlace.mock.calls.length;

    const again = await weatherProvider().climateForMany([
      { name: 'Hyperborea', country: 'Italy' },
    ]);

    expect(geocodePlace.mock.calls.length).toBe(callsAfterFirst);
    expect(again.unavailable.size).toBe(0);
  });
});

describe('a batch of mixed outcomes', () => {
  it('keeps the three apart', async () => {
    geocodePlace.mockResolvedValueOnce(place('Bracciano'));
    fetchDailySeries.mockResolvedValueOnce(ONE_DAY);
    geocodePlace.mockRejectedValueOnce(new TransientWeatherError('Open-Meteo archive 429'));
    geocodePlace.mockRejectedValueOnce(new UnknownPlaceError('Numenor'));

    const batch = await weatherProvider().climateForMany([
      { name: 'Bracciano', country: 'Italy' },
      { name: 'Nettuno', country: 'Italy' },
      { name: 'Numenor', country: 'Italy' },
    ]);

    expect([...batch.found.keys()]).toEqual(['Bracciano']);
    expect([...batch.unavailable]).toEqual(['Nettuno']);
  });
});
