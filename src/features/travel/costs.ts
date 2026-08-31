import 'server-only';

import { placeNameKey } from '@/lib/place-name-key';
import { nightsBetween } from '@/lib/time';

import { activityProvider } from './activities';
import { flightProvider } from './flights';
import { hotelProvider } from './hotels';
import { quotedCheapestFirst } from './rates';
import type {
  ActivityResult,
  CostEstimate,
  CostProvider,
  CostQuery,
  FlightFare,
  FlightSearch,
  HotelResult,
} from './types';

/**
 * What a trip costs, added up from things that were actually quoted.
 *
 * No arithmetic here is clever; the design is entirely in what it refuses to do.
 * A trip costs four things — a bed, a way there, admission, and eating — and this app
 * now has a real source for three: the room, the fare and the entry prices. The
 * obvious way to produce the total a traveller asked for is a per-diem for the fourth,
 * and it would be the single invented number in a codebase whose whole premise is that
 * every figure came from somewhere. It would also be the number they budget against.
 *
 * So this returns a floor and is built so a floor cannot be mistaken for a total:
 * the excluded categories travel inside the payload, the count of places with no
 * listed price travels beside the sum of the ones that had one, and a stated
 * ceiling is only ever reported as provably broken, never as met.
 *
 * Both underlying searches are the same calls the itinerary turn already makes with
 * the same arguments, so in practice this composes cached results rather than
 * spending more quota.
 */

/** Enough attractions to represent a few days out, matching the activity tool. */
const DEFAULT_ACTIVITY_LIMIT = 6;

/** Nobody is a party of zero, and an absent count must not inflate a total. */
const DEFAULT_TRAVELERS = 1;

/**
 * Real money that no provider here reports, at all.
 *
 * Named rather than estimated, and these two are different in kind from the lines
 * that merely failed to price: nothing behind this app knows what dinner costs in
 * Lisbon or what the metro charges, so no amount of extra input would fill them.
 */
const NEVER_PRICED = ['food and drink', 'local transport'] as const;

/**
 * Everything missing from the total, including the things that were meant to be in it.
 *
 * A fixed list was a bug once and the lesson generalised. A party of four gets
 * properties back with no rates at all, because Google will not price four people
 * into one room — the total quietly became entry fees alone while still claiming to
 * exclude only flights, food and transport, so the largest cost of the trip went
 * missing from the list whose entire job is to say what is missing.
 *
 * So this is derived from what actually priced, every time, and the two biggest
 * absences are named first with the reason they are absent. "Flights" being missing
 * because nobody said where they are flying from is a different fact from its being
 * unknowable, and a traveller can act on the first.
 */
function exclusionsFor(
  lodging: CostEstimate['lodging'],
  flights: CostEstimate['flights'],
  datesKnown: boolean,
  routeKnown: boolean,
): string[] {
  const missing: string[] = [];

  if (!flights) {
    missing.push(
      routeKnown
        ? 'flights — no fare came back for that route on these dates'
        : 'flights — nobody has said which airport you are flying from',
    );
  }

  if (!lodging) {
    missing.push(
      datesKnown
        ? 'somewhere to stay — no rates came back for these dates and this party size'
        : 'somewhere to stay — a room can only be priced against real dates',
    );
  }

  return [...missing, ...NEVER_PRICED];
}

/** USD throughout: every provider here quotes it, and mixing currencies silently would not. */
const CURRENCY = 'USD';

/**
 * One property's own rate and its own stay total.
 *
 * Never the lowest of each taken separately: those can come from different hotels,
 * and a total no single booking could produce is a fabrication assembled entirely
 * from true parts.
 */
function priceOf(
  hotel: HotelResult,
  nights: number | null,
  basis: 'recommended' | 'cheapest',
): CostEstimate['lodging'] {
  const nightly = hotel.pricePerNight;
  if (nightly === null || nightly <= 0) return null;

  const stayTotal = hotel.totalPrice ?? (nights === null ? null : Math.round(nightly * nights));

  // A nightly rate with no way to reach a stay total cannot be added to anything.
  if (stayTotal === null) return null;

  return {
    property: hotel.name,
    nightlyUsd: nightly,
    stayTotalUsd: stayTotal,
    basis,
    rooms: hotel.rooms,
  };
}

/**
 * The room this total should be built from.
 *
 * Prefers the property the caller says it is recommending, because a total that
 * disagrees with the stay named beside it is worse than a higher one. Falls back to
 * the cheapest quoted room, which is what a floor means when no stay has been chosen
 * yet — and also when the named one came back without a rate, since an unpriceable
 * recommendation should not erase the lodging line altogether.
 */
function lodgingFor(
  hotels: readonly HotelResult[],
  nights: number | null,
  requested: string | undefined,
): CostEstimate['lodging'] {
  if (requested) {
    const wanted = placeNameKey(requested);
    const match = hotels.find((hotel) => placeNameKey(hotel.name) === wanted);
    const priced = match ? priceOf(match, nights, 'recommended') : null;
    if (priced) return priced;
  }

  const cheapest = quotedCheapestFirst(hotels)[0];

  return cheapest ? priceOf(cheapest, nights, 'cheapest') : null;
}

/**
 * Admission for the party, and how much of the list it actually covers.
 *
 * Free entries are counted separately from unpriced ones because they are opposite
 * facts that both contribute zero: a park Google says is free is priced at zero,
 * while a restaurant it says nothing about is simply unmeasured.
 */
function admission(
  activities: readonly ActivityResult[],
  travelers: number,
): CostEstimate['activities'] {
  if (activities.length === 0) return null;

  let entryTotal = 0;
  let priced = 0;
  let free = 0;
  let unpriced = 0;

  for (const activity of activities) {
    if (activity.price === null) {
      unpriced += 1;
      continue;
    }

    if (activity.price === 0) {
      free += 1;
      continue;
    }

    priced += 1;
    entryTotal += activity.price * travelers;
  }

  return { entryTotalUsd: Math.round(entryTotal), priced, free, unpriced };
}

/**
 * The cheapest fare on the route, as a cost line.
 *
 * Cheapest rather than a representative one, for the same reason lodging falls back
 * to the cheapest room: this is a floor, and a floor built from anything other than
 * the lowest real number is not one. Google's own verdict on that fare rides along,
 * because "typical for this route" is the part a traveller can act on.
 */
function cheapestFare(search: FlightSearch | null, query: CostQuery): CostEstimate['flights'] {
  const cheapest = search?.fares.reduce<FlightFare | null>(
    (best, fare) => (best === null || fare.priceUsd < best.priceUsd ? fare : best),
    null,
  );

  if (!cheapest || cheapest.priceUsd <= 0) return null;

  return {
    originAirport: query.originAirport?.trim().toUpperCase() ?? '',
    destinationAirport: query.destinationAirport?.trim().toUpperCase() ?? '',
    totalUsd: cheapest.priceUsd,
    roundTrip: cheapest.roundTrip,
    level: search?.insight?.level ?? null,
  };
}

const composingProvider: CostProvider = {
  name: 'quoted-lines',

  async estimateCosts(query: CostQuery): Promise<CostEstimate> {
    const travelers = query.travelers ?? DEFAULT_TRAVELERS;
    // Derived from the dates in preference to anything the caller passed: the same
    // two dates already decide which nights are being priced, and a length that
    // disagreed with them would scale the largest line of the trip by the difference.
    const nights = nightsBetween(query.checkIn, query.checkOut) ?? query.nights ?? null;
    const datesKnown = Boolean(query.checkIn && query.checkOut);
    const routeKnown = Boolean(query.originAirport && query.destinationAirport && query.checkIn);

    const [hotels, activities, flightSearch] = await Promise.all([
      datesKnown
        ? hotelProvider().searchHotels({
            destination: query.destination,
            checkIn: query.checkIn,
            checkOut: query.checkOut,
            budgetLevel: query.budgetLevel,
            guests: travelers,
            // Only prices are read from these; the cards are rendered by their own tools.
            withImages: false,
          })
        : [],
      activityProvider().searchActivities({
        destination: query.destination,
        country: query.country,
        category: query.category,
        limit: query.limit ?? DEFAULT_ACTIVITY_LIMIT,
        withImages: false,
      }),
      routeKnown
        ? flightProvider().searchFlights({
            origin: query.originAirport ?? '',
            destination: query.destinationAirport ?? '',
            departDate: query.checkIn ?? '',
            returnDate: query.checkOut,
            travelers,
          })
        : null,
    ]);

    const lodging = lodgingFor(hotels, nights, query.lodgingProperty);
    const entries = admission(activities, travelers);
    const flights = cheapestFare(flightSearch, query);

    const measuredTotalUsd =
      (flights?.totalUsd ?? 0) + (lodging?.stayTotalUsd ?? 0) + (entries?.entryTotalUsd ?? 0);

    const budget =
      query.maxTotalUsd === undefined
        ? null
        : {
            ceilingUsd: query.maxTotalUsd,
            unallocatedUsd: query.maxTotalUsd - measuredTotalUsd,
            alreadyExceeded: measuredTotalUsd > query.maxTotalUsd,
          };

    return {
      destination: query.destination,
      currency: CURRENCY,
      nights,
      travelers,
      flights,
      lodging,
      activities: entries,
      measuredTotalUsd,
      excluded: exclusionsFor(lodging, flights, datesKnown, routeKnown),
      budget,
    };
  },
};

/** The seam, matching the hotel, activity and destination providers. */
export function costProvider(): CostProvider {
  return composingProvider;
}
