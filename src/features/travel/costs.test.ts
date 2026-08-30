import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ActivityQuery,
  ActivityResult,
  FlightQuery,
  FlightSearch,
  HotelQuery,
  HotelResult,
} from './types';

/**
 * The cost floor, tested through the real provider with the network stubbed out.
 *
 * The alternative was exporting the three private helpers and testing them
 * directly, which would have checked the arithmetic and missed the thing that
 * actually went wrong twice: how the pieces are assembled. Both live bugs here were
 * composition bugs — a total that disagreed with the prose beside it, and an
 * exclusions list that omitted the largest cost of the trip — and neither would have
 * been visible in a test of `admission()` on its own.
 *
 * So the seams are mocked at the provider boundary and everything above it is the
 * code that ships.
 */

// Typed with their arguments, so the assertions about what gets asked of the
// providers are checked rather than cast.
const searchHotels = vi.fn<(query: HotelQuery) => Promise<HotelResult[]>>();
const searchActivities = vi.fn<(query: ActivityQuery) => Promise<ActivityResult[]>>();
const searchFlights = vi.fn<(query: FlightQuery) => Promise<FlightSearch>>();

vi.mock('./hotels', () => ({
  hotelProvider: () => ({ name: 'stub', searchHotels }),
}));

vi.mock('./activities', () => ({
  activityProvider: () => ({ name: 'stub', searchActivities }),
}));

vi.mock('./flights', () => ({
  flightProvider: () => ({ name: 'stub', searchFlights }),
}));

const { costProvider } = await import('./costs');

function hotel(
  name: string,
  pricePerNight: number | null,
  totalPrice: number | null,
  rooms = 1,
): HotelResult {
  return {
    id: name,
    name,
    type: 'hotel',
    pricePerNight,
    totalPrice,
    rooms,
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

function activity(name: string, price: number | null): ActivityResult {
  return {
    id: name,
    name,
    category: 'Tourist attraction',
    price,
    priceLabel: price === null ? null : price === 0 ? 'Free' : `$${price}`,
    currency: 'USD',
    rating: 4.6,
    reviewCount: 1200,
    description: null,
    bookingUrl: 'https://example.test',
    provider: 'stub',
    image: null,
  };
}

/** Five nights in Lisbon for two, which is the shape every case here uses. */
const TRIP = {
  destination: 'Lisbon',
  country: 'Portugal',
  checkIn: '2026-09-18',
  checkOut: '2026-09-23',
  nights: 5,
  travelers: 2,
} as const;

function fare(priceUsd: number, id = `fare-${priceUsd}`): FlightSearch['fares'][number] {
  return {
    id,
    priceUsd,
    currency: 'USD',
    airlines: ['TAP Air Portugal'],
    durationMinutes: 430,
    stops: 0,
    roundTrip: true,
    bookingUrl: 'https://example.test',
  };
}

/** Both airport codes, which is what makes the route priceable. */
const ROUTE = { originAirport: 'JFK', destinationAirport: 'LIS' } as const;

beforeEach(() => {
  searchHotels.mockReset();
  searchActivities.mockReset();
  searchFlights.mockReset();
  searchHotels.mockResolvedValue([]);
  searchActivities.mockResolvedValue([]);
  searchFlights.mockResolvedValue({ fares: [], insight: null, searchUrl: null });
});

describe('estimateCosts: the arithmetic', () => {
  it('adds the stay total to admission for the whole party', () => {
    searchHotels.mockResolvedValue([hotel('Independente', 66, 330)]);
    searchActivities.mockResolvedValue([activity('Castelo', 20)]);

    return costProvider()
      .estimateCosts({ ...TRIP })
      .then((estimate) => {
        // Entry is per head and the room is not: 330 + (20 × 2).
        expect(estimate.activities?.entryTotalUsd).toBe(40);
        expect(estimate.measuredTotalUsd).toBe(370);
      });
  });

  it('always equals the sum of the lines a card would render', async () => {
    searchHotels.mockResolvedValue([hotel('Independente', 66, 330)]);
    searchActivities.mockResolvedValue([activity('A', 10), activity('B', null), activity('C', 0)]);

    const estimate = await costProvider().estimateCosts({ ...TRIP });

    expect(estimate.measuredTotalUsd).toBe(
      (estimate.lodging?.stayTotalUsd ?? 0) + (estimate.activities?.entryTotalUsd ?? 0),
    );
  });

  it('counts free and unpriced places apart, since they mean opposite things', async () => {
    searchActivities.mockResolvedValue([
      activity('Paid', 15),
      activity('Free park', 0),
      activity('Restaurant', null),
      activity('Another restaurant', null),
    ]);

    const estimate = await costProvider().estimateCosts({ ...TRIP });

    expect(estimate.activities).toMatchObject({ priced: 1, free: 1, unpriced: 2 });
    // A park Google calls free is measured at zero; a restaurant it says nothing
    // about is simply unmeasured, and a total covering one of four must say so.
    expect(estimate.activities?.entryTotalUsd).toBe(30);
  });

  it('derives a stay total from the nightly rate when the source gives no total', async () => {
    searchHotels.mockResolvedValue([hotel('Nightly only', 50, null)]);

    const estimate = await costProvider().estimateCosts({ ...TRIP });

    expect(estimate.lodging?.stayTotalUsd).toBe(250);
  });

  it('reads the length off the dates rather than off what the caller passed', async () => {
    /*
     * The caller used to have to say how many nights, and a live planning turn
     * simply did not. The rate was then multipliable by nothing, the room dropped
     * out of the floor entirely, and the largest line of the trip went missing from
     * a total whose one job is to say what the trip costs. The two dates were in the
     * same call the whole time.
     */
    searchHotels.mockResolvedValue([hotel('Nightly only', 50, null)]);

    const estimate = await costProvider().estimateCosts({
      destination: 'Lisbon',
      checkIn: '2026-09-18',
      checkOut: '2026-09-23',
      travelers: 2,
    });

    expect(estimate.lodging?.stayTotalUsd).toBe(250);
  });

  it('prefers the dates over a length that disagrees with them', async () => {
    // Two sources for one figure, and only one of them also decides which nights
    // were searched for. A stay priced for six nights against a five-night booking
    // is wrong by a night in the direction nobody checks.
    searchHotels.mockResolvedValue([hotel('Nightly only', 50, null)]);

    const estimate = await costProvider().estimateCosts({ ...TRIP, nights: 6 });

    expect(estimate.lodging?.stayTotalUsd).toBe(250);
    expect(estimate.nights).toBe(5);
  });

  it('skips a room it still cannot reach a stay total for', async () => {
    // Dates it cannot read are the remaining way to hold a rate and no length, and
    // guessing the stay would invent the figure this module refuses to invent.
    searchHotels.mockResolvedValue([hotel('Nightly only', 50, null)]);

    const estimate = await costProvider().estimateCosts({
      destination: 'Lisbon',
      checkIn: 'next week',
      checkOut: 'the week after',
      travelers: 2,
    });

    expect(estimate.lodging).toBeNull();
  });
});

describe('estimateCosts: which room gets priced', () => {
  it('prices the stay the caller is recommending, not the cheapest', async () => {
    // The live bug: the tool priced a $47 room while the itinerary recommended a $66
    // one, so the trip floor came out *below* the stay named five lines above it.
    searchHotels.mockResolvedValue([
      hotel('WOT Patio Social', 47, 235),
      hotel('Independente Principe Real', 66, 330),
    ]);

    const estimate = await costProvider().estimateCosts({
      ...TRIP,
      lodgingProperty: 'Independente Principe Real',
    });

    expect(estimate.lodging).toMatchObject({
      property: 'Independente Principe Real',
      stayTotalUsd: 330,
      basis: 'recommended',
    });
  });

  it('matches a recommended property through spelling differences', async () => {
    searchHotels.mockResolvedValue([hotel('Independente Príncipe Real', 66, 330)]);

    const estimate = await costProvider().estimateCosts({
      ...TRIP,
      lodgingProperty: 'the independente principe real',
    });

    expect(estimate.lodging?.basis).toBe('recommended');
  });

  it('falls back to the cheapest room and says so when no property was named', async () => {
    searchHotels.mockResolvedValue([hotel('Dear', 200, 1000), hotel('Cheap', 47, 235)]);

    const estimate = await costProvider().estimateCosts({ ...TRIP });

    expect(estimate.lodging).toMatchObject({ property: 'Cheap', basis: 'cheapest' });
  });

  it('falls back rather than dropping lodging when the named property has no rate', async () => {
    searchHotels.mockResolvedValue([hotel('Named', null, null), hotel('Cheap', 47, 235)]);

    const estimate = await costProvider().estimateCosts({
      ...TRIP,
      lodgingProperty: 'Named',
    });

    expect(estimate.lodging).toMatchObject({ property: 'Cheap', basis: 'cheapest' });
  });

  it("never mixes one hotel's nightly rate with another's stay total", async () => {
    // A total no single booking could produce is a fabrication assembled from
    // true parts, so the cheapest nightly rate must carry its own total.
    searchHotels.mockResolvedValue([
      hotel('Cheap nightly', 47, 900),
      hotel('Dear nightly', 200, 235),
    ]);

    const estimate = await costProvider().estimateCosts({ ...TRIP });

    expect(estimate.lodging).toMatchObject({ nightlyUsd: 47, stayTotalUsd: 900 });
  });
});

/** Asserted by content, since the order reflects which lines happened to fail. */
const excludes = (estimate: { excluded: string[] }, needle: string): boolean =>
  estimate.excluded.some((item) => item.includes(needle));

describe('estimateCosts: what it admits to leaving out', () => {
  it('names the two categories nothing here will ever price', async () => {
    searchHotels.mockResolvedValue([hotel('Independente', 66, 330)]);
    searchFlights.mockResolvedValue({ fares: [fare(700)], insight: null, searchUrl: null });

    const estimate = await costProvider().estimateCosts({ ...TRIP, ...ROUTE });

    // With a fare and a room both priced, only the genuinely unknowable remain.
    expect(estimate.excluded).toEqual(['food and drink', 'local transport']);
  });

  it('distinguishes a missing origin from a route that would not price', async () => {
    // Two different facts, and only one of them is something a traveller can fix.
    const noOrigin = await costProvider().estimateCosts({ ...TRIP });
    expect(excludes(noOrigin, 'nobody has said which airport')).toBe(true);

    const noFare = await costProvider().estimateCosts({ ...TRIP, ...ROUTE });
    expect(excludes(noFare, 'no fare came back')).toBe(true);
  });

  /**
   * The second live bug, and the worse of the two.
   *
   * A party of four gets properties back with no rates at all, because Google will
   * not price four people into one room. The floor then quietly became entry fees
   * alone while still claiming to exclude only flights, food and transport — the
   * room went missing from the very list whose job is to say what is missing.
   */
  it('admits the room is missing when nothing could be priced', async () => {
    searchHotels.mockResolvedValue([hotel('Unpriceable', null, null)]);
    searchActivities.mockResolvedValue([activity('Castelo', 20)]);

    const estimate = await costProvider().estimateCosts({ ...TRIP, travelers: 4 });

    expect(estimate.lodging).toBeNull();
    expect(excludes(estimate, 'somewhere to stay')).toBe(true);
  });

  it('carries the room count through, so a multiplied rate is not read as a quote', async () => {
    searchHotels.mockResolvedValue([hotel('Family split', 132, 660, 2)]);

    const estimate = await costProvider().estimateCosts({ ...TRIP, travelers: 4 });

    expect(estimate.lodging).toMatchObject({ rooms: 2, stayTotalUsd: 660 });
    // The room is priced now, so it is no longer among the things left out.
    expect(estimate.excluded.some((item) => item.includes('stay'))).toBe(false);
  });

  it('distinguishes an unpriceable stay from one that was never dated', async () => {
    const undated = await costProvider().estimateCosts({ destination: 'Lisbon', travelers: 2 });

    expect(excludes(undated, 'only be priced against real dates')).toBe(true);
  });

  it('does not claim to exclude a stay it actually priced', async () => {
    searchHotels.mockResolvedValue([hotel('Independente', 66, 330)]);

    const estimate = await costProvider().estimateCosts({ ...TRIP });

    expect(estimate.excluded.some((item) => item.includes('stay'))).toBe(false);
  });

  it('does not price a room at all without both dates', async () => {
    await costProvider().estimateCosts({ destination: 'Lisbon', travelers: 2 });

    // An undated rate is not a rate, so the search is not even attempted.
    expect(searchHotels).not.toHaveBeenCalled();
  });
});

describe('estimateCosts: fares', () => {
  it('adds the cheapest fare to the floor', async () => {
    searchFlights.mockResolvedValue({
      fares: [fare(900), fare(700), fare(1200)],
      insight: null,
      searchUrl: null,
    });
    searchHotels.mockResolvedValue([hotel('Independente', 66, 330)]);

    const estimate = await costProvider().estimateCosts({ ...TRIP, ...ROUTE });

    expect(estimate.flights).toMatchObject({
      originAirport: 'JFK',
      destinationAirport: 'LIS',
      totalUsd: 700,
    });
    expect(estimate.measuredTotalUsd).toBe(1030);
  });

  it('does not scale the fare by the party size', async () => {
    /*
     * Google quotes the party total, confirmed by asking one route for one, two and
     * four adults. Multiplying here would double-count the party and inflate the one
     * figure a traveller checks hardest.
     */
    searchFlights.mockResolvedValue({ fares: [fare(1505)], insight: null, searchUrl: null });

    const estimate = await costProvider().estimateCosts({ ...TRIP, ...ROUTE, travelers: 2 });

    expect(estimate.flights?.totalUsd).toBe(1505);
    expect(estimate.measuredTotalUsd).toBe(1505);
  });

  it("carries Google's verdict on the fare, and invents none when absent", async () => {
    searchFlights.mockResolvedValue({
      fares: [fare(700)],
      insight: { lowestUsd: 700, level: 'low', typicalLowUsd: 850, typicalHighUsd: 1100 },
      searchUrl: null,
    });

    const withLevel = await costProvider().estimateCosts({ ...TRIP, ...ROUTE });
    expect(withLevel.flights?.level).toBe('low');

    searchFlights.mockResolvedValue({ fares: [fare(700)], insight: null, searchUrl: null });
    const withoutLevel = await costProvider().estimateCosts({ ...TRIP, ...ROUTE });
    expect(withoutLevel.flights?.level).toBeNull();
  });

  it('does not look for a fare with only one end of the route', async () => {
    await costProvider().estimateCosts({ ...TRIP, originAirport: 'JFK' });

    expect(searchFlights).not.toHaveBeenCalled();
  });

  it('asks about the same dates and party as the rest of the trip', async () => {
    await costProvider().estimateCosts({ ...TRIP, ...ROUTE });

    expect(searchFlights.mock.calls[0]?.[0]).toMatchObject({
      origin: 'JFK',
      destination: 'LIS',
      departDate: TRIP.checkIn,
      returnDate: TRIP.checkOut,
      travelers: TRIP.travelers,
    });
  });
});

describe('estimateCosts: against a stated ceiling', () => {
  it('reports what is left unallocated rather than whether it fits', async () => {
    searchHotels.mockResolvedValue([hotel('Independente', 66, 330)]);
    searchActivities.mockResolvedValue([activity('Castelo', 20)]);

    const estimate = await costProvider().estimateCosts({ ...TRIP, maxTotalUsd: 2000 });

    expect(estimate.budget).toEqual({
      ceilingUsd: 2000,
      unallocatedUsd: 1630,
      alreadyExceeded: false,
    });
  });

  /**
   * The asymmetry is the point. A floor below the ceiling proves nothing, because
   * the flights and the eating come out of the remainder — so the only boolean here
   * is the one the arithmetic can actually support.
   */
  it('flags a ceiling the floor alone already breaks', async () => {
    searchHotels.mockResolvedValue([hotel('Dear', 400, 2000)]);

    const estimate = await costProvider().estimateCosts({ ...TRIP, maxTotalUsd: 900 });

    expect(estimate.budget?.alreadyExceeded).toBe(true);
    expect(estimate.budget?.unallocatedUsd).toBeLessThan(0);
  });

  it('omits the comparison entirely when no ceiling was given', async () => {
    const estimate = await costProvider().estimateCosts({ ...TRIP });

    expect(estimate.budget).toBeNull();
  });

  it('never filters on the ceiling, only reports against it', async () => {
    // A budget is a fact to be honest about, not a reason to hide the only real
    // quote available — a shortlist of nothing helps nobody.
    searchHotels.mockResolvedValue([hotel('Dear', 400, 2000)]);

    const estimate = await costProvider().estimateCosts({ ...TRIP, maxTotalUsd: 100 });

    expect(estimate.lodging).not.toBeNull();
  });
});

describe('estimateCosts: what it asks the providers for', () => {
  it('does not fetch photographs it will never render', async () => {
    await costProvider().estimateCosts({ ...TRIP });

    // Wikipedia rate-limits, and this tool reads prices only. Spending lookups here
    // got the cards that were actually going on screen refused.
    expect(searchHotels.mock.calls[0]?.[0]).toMatchObject({ withImages: false });
    expect(searchActivities.mock.calls[0]?.[0]).toMatchObject({ withImages: false });
  });

  it('passes the party size through, so the rooms quoted can hold them', async () => {
    await costProvider().estimateCosts({ ...TRIP, travelers: 3 });

    expect(searchHotels.mock.calls[0]?.[0]).toMatchObject({ guests: 3 });
  });

  it('treats an absent party size as one rather than inflating a total', async () => {
    searchActivities.mockResolvedValue([activity('Castelo', 20)]);

    const estimate = await costProvider().estimateCosts({ destination: 'Lisbon' });

    expect(estimate.travelers).toBe(1);
    expect(estimate.activities?.entryTotalUsd).toBe(20);
  });
});
