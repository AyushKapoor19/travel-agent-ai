import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClimateBatch, PlaceQuery } from '@/features/weather/server';
import type { ClimateNormals, GeocodedPlace } from '@/features/weather/shared';
import { MONTHS_PER_YEAR } from '@/lib/months';

import type { ActivityQuery, ActivityResult, HotelQuery, HotelResult } from './types';

/**
 * What a shortlist does when one of the four things behind it stops answering.
 *
 * Written after the destination recommender stopped working entirely. Open-Meteo's
 * free tier allows 10,000 calls a day and prices a request by the data it moves, so
 * a decade of daily observations costs about 78 of them — roughly 128 unseen places
 * a day, which a day of development can spend. Once it was spent, the archive
 * refused every request, and `verifyAll` required a climate to build a candidate at
 * all. Every proposal was therefore dropped, the tool returned an empty shortlist,
 * and the traveller was told "I wasn't able to check options in Mexico just now" —
 * on an afternoon when the geocoder, the hotel rates, the sights and the
 * photographs were all answering perfectly well.
 *
 * The fix is that a missing climate costs the weather line and nothing else, and
 * these are the tests that hold it there. Mocked at the four provider seams, so
 * everything above them is the code that ships.
 */

const climateForMany = vi.fn<(queries: readonly PlaceQuery[]) => Promise<ClimateBatch>>();
const searchHotels = vi.fn<(query: HotelQuery) => Promise<HotelResult[]>>();
const searchActivities = vi.fn<(query: ActivityQuery) => Promise<ActivityResult[]>>();
const lookup = vi.fn<(queries: readonly string[]) => Promise<Map<string, null>>>();

vi.mock('@/features/weather/server', () => ({
  weatherProvider: () => ({ name: 'stub', climateForMany }),
}));

vi.mock('./hotels', () => ({
  hotelProvider: () => ({ name: 'stub', searchHotels }),
}));

vi.mock('./activities', () => ({
  activityProvider: () => ({ name: 'stub', searchActivities }),
}));

vi.mock('@/features/photos/server', () => ({
  imageProvider: () => ({ name: 'stub', lookup }),
}));

const { destinationProvider } = await import('./destinations');

function geocoded(name: string, country = 'Mexico'): GeocodedPlace {
  return {
    name,
    country,
    latitude: 17.06,
    longitude: -96.72,
    timezone: 'America/Mexico_City',
    population: 255_029,
  };
}

/** Twelve months at one temperature, which is all the ranking needs to be exercised. */
function normals(name: string, avgHighC: number, country = 'Mexico'): ClimateNormals {
  return {
    place: geocoded(name, country),
    months: Array.from({ length: MONTHS_PER_YEAR }, (_, monthIndex) => ({
      monthIndex,
      avgHighC,
      avgLowC: avgHighC - 10,
      precipitationMm: 20,
    })),
    window: { fromYear: 2016, toYear: 2025 },
  };
}

function hotel(name: string, pricePerNight: number): HotelResult {
  return {
    id: name,
    name,
    type: 'hotel',
    pricePerNight,
    totalPrice: pricePerNight * 7,
    rooms: 1,
    currency: 'USD',
    rating: 4.4,
    reviewCount: 800,
    stars: 4,
    locationRating: 4.5,
    amenities: [],
    description: null,
    bookingUrl: 'https://example.test',
    provider: 'stub',
    image: null,
  };
}

function activity(name: string): ActivityResult {
  return {
    id: name,
    name,
    category: 'Tourist attraction',
    price: null,
    priceLabel: null,
    currency: 'USD',
    rating: 4.6,
    reviewCount: 1200,
    description: null,
    bookingUrl: 'https://example.test',
    provider: 'stub',
    image: null,
  };
}

function batch(parts: Partial<ClimateBatch>): ClimateBatch {
  return {
    found: parts.found ?? new Map(),
    located: parts.located ?? new Map(),
    unavailable: parts.unavailable ?? new Set(),
  };
}

/** A week in September for two, which is the brief that produced the live failure. */
const QUERY = {
  monthIndex: 8,
  checkIn: '2026-09-01',
  checkOut: '2026-09-08',
  travelers: 2,
  limit: 3,
} as const;

const MEXICO = [
  { city: 'Oaxaca City', country: 'Mexico', why: 'Food capital of the country.' },
  { city: 'Mérida', country: 'Mexico', why: 'Colonial calm and cenotes.' },
  { city: 'Puerto Escondido', country: 'Mexico', why: 'Laid-back Pacific coast.' },
];

beforeEach(() => {
  climateForMany.mockReset();
  searchHotels.mockReset();
  searchActivities.mockReset();
  lookup.mockReset();

  searchHotels.mockResolvedValue([hotel('Casa Antigua', 74)]);
  searchActivities.mockResolvedValue([activity('Monte Albán')]);
  lookup.mockResolvedValue(new Map());
});

describe('an archive that answers for nobody', () => {
  it('still returns a shortlist, from the sources that did answer', async () => {
    climateForMany.mockResolvedValue(
      batch({
        located: new Map(MEXICO.map(({ city }) => [city, geocoded(city)])),
        unavailable: new Set(MEXICO.map(({ city }) => city)),
      }),
    );

    const shortlist = await destinationProvider().recommendDestinations({
      ...QUERY,
      candidates: MEXICO,
    });

    expect(shortlist.destinations).toHaveLength(3);
    expect(shortlist.rejected).toEqual([]);
  });

  /*
   * The half that keeps the fix honest. Surviving without a climate must not mean
   * inventing one: no temperature, no rain band, no best months, and no provenance
   * line claiming a decade of observations nobody read.
   */
  it('claims no weather it could not measure', async () => {
    climateForMany.mockResolvedValue(
      batch({
        located: new Map([['Oaxaca City', geocoded('Oaxaca City')]]),
        unavailable: new Set(['Oaxaca City']),
      }),
    );

    const [destination] = (
      await destinationProvider().recommendDestinations({
        ...QUERY,
        candidates: [MEXICO[0]!],
      })
    ).destinations;

    expect(destination?.weather).toBeNull();
    expect(destination?.bestMonths).toEqual([]);
    expect(destination?.reasons.some((reason) => reason.kind === 'climate')).toBe(false);
    expect(destination?.reasons.some((reason) => reason.kind === 'season')).toBe(false);
  });

  /* Everything the other three providers returned is still on the card. */
  it('keeps the rates, the sights and the country it resolved', async () => {
    climateForMany.mockResolvedValue(
      batch({
        located: new Map([['Oaxaca City', geocoded('Oaxaca City')]]),
        unavailable: new Set(['Oaxaca City']),
      }),
    );

    const [destination] = (
      await destinationProvider().recommendDestinations({
        ...QUERY,
        candidates: [MEXICO[0]!],
      })
    ).destinations;

    expect(destination?.country).toBe('Mexico');
    expect(destination?.cost?.nightlyFromUsd).toBe(74);
    expect(destination?.highlights).toEqual(['Monte Albán']);
    expect(destination?.reasons.some((reason) => reason.kind === 'cost')).toBe(true);
  });

  /*
   * The wording the traveller saw came from `rejected`, and an outage must not put
   * anything there: the prompt is told never to name a candidate rejected as
   * "unavailable", so a place listed there is a place that cannot be recommended.
   */
  it('rejects nothing, because nothing about the places failed', async () => {
    climateForMany.mockResolvedValue(
      batch({
        located: new Map(MEXICO.map(({ city }) => [city, geocoded(city)])),
        unavailable: new Set(MEXICO.map(({ city }) => city)),
      }),
    );

    const shortlist = await destinationProvider().recommendDestinations({
      ...QUERY,
      candidates: MEXICO,
    });

    expect(shortlist.rejected).toEqual([]);
  });
});

describe('a place the geocoder cannot find', () => {
  it('is still dropped, because that is a fact about the place', async () => {
    climateForMany.mockResolvedValue(
      batch({ found: new Map([['Mérida', normals('Mérida', 33)]]) }),
    );

    const shortlist = await destinationProvider().recommendDestinations({
      ...QUERY,
      candidates: [MEXICO[1]!, { city: 'Atlantis', country: 'Mexico', why: 'Invented.' }],
    });

    expect(shortlist.destinations.map((d) => d.city)).toEqual(['Mérida']);
    expect(shortlist.rejected).toEqual([{ city: 'Atlantis', reason: 'unmappable' }]);
  });

  /* An outage with no coordinates to show for it is still an outage, not a bad name. */
  it('is called unavailable when the lookup itself failed', async () => {
    climateForMany.mockResolvedValue(batch({ unavailable: new Set(['Oaxaca City']) }));

    const shortlist = await destinationProvider().recommendDestinations({
      ...QUERY,
      candidates: [MEXICO[0]!],
    });

    expect(shortlist.destinations).toEqual([]);
    expect(shortlist.rejected).toEqual([{ city: 'Oaxaca City', reason: 'unavailable' }]);
  });
});

describe('a stated climate preference', () => {
  it('still drops a place whose measured highs contradict it', async () => {
    climateForMany.mockResolvedValue(
      batch({
        found: new Map([
          ['Mérida', normals('Mérida', 34)],
          ['Oaxaca City', normals('Oaxaca City', 26)],
        ]),
      }),
    );

    const shortlist = await destinationProvider().recommendDestinations({
      ...QUERY,
      climate: 'cold',
      candidates: [MEXICO[1]!, MEXICO[0]!],
    });

    expect(shortlist.destinations).toEqual([]);
    expect(shortlist.rejected).toEqual([
      { city: 'Mérida', reason: 'wrong-climate' },
      { city: 'Oaxaca City', reason: 'wrong-climate' },
    ]);
  });

  /*
   * An unmeasured candidate cannot be checked against the preference, so it is
   * neither asserted to match nor rejected for failing — it comes back with no
   * weather, which the prompt requires be said out loud.
   */
  it('cannot reject an unmeasured place, and does not pretend to', async () => {
    climateForMany.mockResolvedValue(
      batch({
        located: new Map([['Oaxaca City', geocoded('Oaxaca City')]]),
        unavailable: new Set(['Oaxaca City']),
      }),
    );

    const shortlist = await destinationProvider().recommendDestinations({
      ...QUERY,
      climate: 'cold',
      candidates: [MEXICO[0]!],
    });

    expect(shortlist.destinations).toHaveLength(1);
    expect(shortlist.destinations[0]?.weather).toBeNull();
    expect(shortlist.rejected).toEqual([]);
  });

  /*
   * A measured city is the better answer, and `scoreOf` averages over the
   * dimensions that applied — so an unmeasured one, judged on the room rate alone,
   * could otherwise score higher than a city that actually passed the climate check
   * and take its place in the top three.
   */
  it('ranks a measured place above an unmeasured one', async () => {
    searchHotels.mockImplementation(({ destination }) =>
      // The unmeasured city is made the cheaper of the two, so a score-only sort
      // would put it first.
      Promise.resolve([hotel('Stay', destination.startsWith('Puerto') ? 40 : 200)]),
    );

    climateForMany.mockResolvedValue(
      batch({
        found: new Map([['Mérida', normals('Mérida', 29)]]),
        located: new Map([['Puerto Escondido', geocoded('Puerto Escondido')]]),
        unavailable: new Set(['Puerto Escondido']),
      }),
    );

    const shortlist = await destinationProvider().recommendDestinations({
      ...QUERY,
      climate: 'warm',
      budgetLevel: 'budget',
      candidates: [MEXICO[2]!, MEXICO[1]!],
      limit: 1,
    });

    expect(shortlist.destinations.map((d) => d.city)).toEqual(['Mérida']);
  });
});
