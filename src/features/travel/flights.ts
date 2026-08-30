import 'server-only';

import { z } from 'zod';

import { cacheKey, createTtlCache } from '@/features/serpapi/cache';
import { serpApiSearch } from '@/features/serpapi/client';
import { SerpApiEngine } from '@/features/serpapi/constants';

import type { FlightProvider, FlightQuery, FlightSearch } from './types';

/**
 * Fares, from Google Flights.
 *
 * The last of the four things a trip costs to get a real source, and the one the
 * prompt spent the longest refusing to talk about — "you cannot check flight fares"
 * was a standing honesty rule precisely because a plausible range is so easy to
 * produce and so useless.
 *
 * Two facts about the payload shaped everything here.
 *
 * Prices are for the **whole party**, not per passenger. Confirmed rather than
 * assumed, by asking the same route for one, two and four adults and watching
 * $753 become $1,505 and then $3,010. Worth the two extra searches to establish:
 * lodging and admission are already party totals in this codebase, and a
 * per-passenger fare added to them would have been wrong by a factor of the party
 * size in the one figure a traveller checks hardest.
 *
 * Google also returns its own verdict on the fare — `price_level`, against a
 * `typical_price_range` for that route and season. That is the rarest thing in this
 * app: an assessment that is measured rather than asserted. It answers "is this a
 * good time to book", which no amount of prompt engineering could honestly produce,
 * so it travels through to the card intact.
 */

/** Three-letter IATA codes only. Anything else is a typo, not a route. */
const IATA_PATTERN = /^[A-Z]{3}$/;

/** Fares shown. Google returns its own shortlist; a card holds three comfortably. */
const MAX_FARES = 3;

const PRICE_CURRENCY = 'USD';

const airportSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
});

const legSchema = z.object({
  airline: z.string().optional(),
  departure_airport: airportSchema.optional(),
  arrival_airport: airportSchema.optional(),
});

const itinerarySchema = z.object({
  flights: z.array(legSchema).optional(),
  layovers: z.array(z.unknown()).optional(),
  total_duration: z.number().optional(),
  price: z.number().optional(),
  type: z.string().optional(),
});

const insightsSchema = z.object({
  lowest_price: z.number().optional(),
  price_level: z.string().optional(),
  typical_price_range: z.array(z.number()).optional(),
});

const flightsResponseSchema = z.object({
  best_flights: z.array(itinerarySchema).optional(),
  other_flights: z.array(itinerarySchema).optional(),
  price_insights: insightsSchema.optional(),
  search_metadata: z.object({ google_flights_url: z.string().optional() }).optional(),
});

const flightsCache = createTtlCache<FlightSearch>();

/** Empty rather than an error: a route with no fares is a real answer. */
const NO_FARES: FlightSearch = { fares: [], insight: null, searchUrl: null };

const serpApiFlightProvider: FlightProvider = {
  name: 'Google Flights via SerpApi',

  async searchFlights(query: FlightQuery): Promise<FlightSearch> {
    const origin = query.origin.trim().toUpperCase();
    const destination = query.destination.trim().toUpperCase();

    // A fare exists for a route on a date. Without all of it there is nothing to
    // quote, and the prompt is told to say so rather than to reach for a range.
    if (!IATA_PATTERN.test(origin) || !IATA_PATTERN.test(destination)) return NO_FARES;
    if (origin === destination || !query.departDate) return NO_FARES;

    const key = cacheKey(
      'flights',
      origin,
      destination,
      query.departDate,
      query.returnDate,
      query.travelers,
    );

    const cached = flightsCache.read(key);
    if (cached) return cached.value ?? NO_FARES;

    const search = await buildSearch(query, origin, destination);
    flightsCache.write(key, search.fares.length > 0 ? search : null);
    return search;
  },
};

async function buildSearch(
  query: FlightQuery,
  origin: string,
  destination: string,
): Promise<FlightSearch> {
  const params: Record<string, string> = {
    departure_id: origin,
    arrival_id: destination,
    outbound_date: query.departDate,
    currency: PRICE_CURRENCY,
    adults: String(query.travelers ?? 1),
    hl: 'en',
    gl: 'us',
  };

  // Google reads a missing return date as one way, which is a different trip and a
  // different price, so the round trip is only asked for when there is a date for it.
  if (query.returnDate) params.return_date = query.returnDate;
  else params.type = ONE_WAY;

  const body = await serpApiSearch(SerpApiEngine.FLIGHTS, params);
  const parsed = flightsResponseSchema.safeParse(body);
  if (!parsed.success) return NO_FARES;

  const { best_flights, other_flights, price_insights, search_metadata } = parsed.data;
  const itineraries = [...(best_flights ?? []), ...(other_flights ?? [])];
  const searchUrl = search_metadata?.google_flights_url ?? null;

  return {
    fares: itineraries
      .filter((itinerary) => itinerary.price !== undefined)
      .slice(0, MAX_FARES)
      .map((itinerary, index) => toFare(itinerary, index, searchUrl)),
    insight: toInsight(price_insights),
    searchUrl,
  };
}

/** Google's own `type` values; 2 is one way. */
const ONE_WAY = '2';

function toFare(
  itinerary: z.infer<typeof itinerarySchema>,
  index: number,
  searchUrl: string | null,
): FlightSearch['fares'][number] {
  const legs = itinerary.flights ?? [];

  return {
    id: `fare-${index}`,
    // The party total, not a per-passenger fare. See the note at the top of the file.
    priceUsd: itinerary.price ?? 0,
    currency: PRICE_CURRENCY,
    // Deduplicated because a two-leg trip on one carrier should read as one airline,
    // and a codeshare should not read as two.
    airlines: [...new Set(legs.map((leg) => leg.airline).filter((name): name is string => !!name))],
    durationMinutes: itinerary.total_duration ?? null,
    /* `layovers` is Google's own count and legs-minus-one is a derivation of it; they
       agree, and preferring the reported one means a malformed leg list cannot turn a
       direct flight into a connection. */
    stops: itinerary.layovers?.length ?? Math.max(0, legs.length - 1),
    roundTrip: itinerary.type !== 'One way',
    bookingUrl: searchUrl,
  };
}

/**
 * Google's verdict on the fare, kept only when it is complete.
 *
 * A price level with no range to read it against is a bare adjective — "typical"
 * means nothing without the band it is typical of — so a partial insight is dropped
 * rather than shown half-formed.
 */
function toInsight(insights: z.infer<typeof insightsSchema> | undefined): FlightSearch['insight'] {
  const lowest = insights?.lowest_price;
  const level = insights?.price_level?.trim();
  if (lowest === undefined || !level) return null;

  const [low, high] = insights?.typical_price_range ?? [];

  return {
    lowestUsd: lowest,
    level,
    typicalLowUsd: low ?? null,
    typicalHighUsd: high ?? null,
  };
}

/** The seam, matching the hotel, activity, destination and cost providers. */
export function flightProvider(): FlightProvider {
  return serpApiFlightProvider;
}
