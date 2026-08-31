import 'server-only';

import { z } from 'zod';

import { cachedList, cacheKey, createTtlCache } from '@/features/serpapi/cache';
import { serpApiSearch } from '@/features/serpapi/client';
import { SerpApiEngine } from '@/features/serpapi/constants';
import { numericField } from '@/features/serpapi/schema';
import { placeNameKey } from '@/lib/place-name-key';

import { BookingProvider, hotelSearchUrl } from './booking-links';
import { withPlaceImages } from './place-images';
import type { BudgetLevel, HotelProvider, HotelQuery, HotelResult } from './types';

/**
 * Stays, from Google Hotels.
 *
 * Every field on the card is quoted rather than derived, which is the whole
 * difference from what this replaced. The seed version held a nightly rate per
 * invented property and multiplied it by a budget level — so "Riverside Quarter,
 * €145" was three fabrications stacked: the hotel, the rate, and the arithmetic
 * that produced it. Here the rate is what Google was quoting for those exact
 * dates, and the budget level selects which properties to ask about instead of
 * scaling a number.
 *
 * Coverage is good enough to rely on: across a sample every property carried a
 * description, a star class, a rating, a review count and an amenity list, so
 * nothing on the card needs a fallback in practice, only in type.
 */

const DEFAULT_GUESTS = 2;

/**
 * Adults a single room is assumed to hold, when Google will not price the party.
 *
 * Two, which is the standard double and the conservative read. Google Hotels prices
 * one room and takes no parameter for asking about several, so the only lever is how
 * many adults to name — and past two it frequently returns the properties with every
 * rate null rather than saying it cannot fit them.
 */
const MAX_ADULTS_PER_ROOM = 2;

/** Google quotes in the currency implied by `gl`, and every call here sends `gl=us`. */
const PRICE_CURRENCY = 'USD';

/** Amenities shown beside the price. Two is what fits before the line wraps. */
const AMENITIES_SHOWN = 2;

/**
 * Amenities that distinguish nothing, and so are chosen last.
 *
 * Google returns them in a consistent order that puts these first, so taking the
 * first two verbatim labelled every property in Bali "Free Wi-Fi · Free parking" —
 * true of all four cards and therefore useless on any of them. They are still
 * shown when a property has nothing else to say, since an empty line is worse.
 */
const UBIQUITOUS_AMENITIES = ['free wi-fi', 'wi-fi', 'free parking', 'parking', 'air conditioning'];

function isDistinctive(amenity: string): boolean {
  return !UBIQUITOUS_AMENITIES.includes(amenity.trim().toLowerCase());
}

/** Distinctive amenities first, the generic ones kept as filler behind them. */
function rankAmenities(amenities: readonly string[]): string[] {
  const distinctive = amenities.filter(isDistinctive);
  const generic = amenities.filter((amenity) => !isDistinctive(amenity));

  return [...distinctive, ...generic].slice(0, AMENITIES_SHOWN);
}

/**
 * Budget level as a star-class filter, which is what it actually means to Google.
 *
 * The seed provider expressed the same idea as a multiplier on a made-up rate —
 * luxury cost 1.85× mid-range — which produced a plausible spread and no
 * information. Asking for the classes a budget implies returns genuinely different
 * properties at genuinely different prices, and the overlap between bands is
 * deliberate: a good four-star is a mid-range stay and a luxury one both.
 */
const BUDGET_HOTEL_CLASS: Record<BudgetLevel, string> = {
  budget: '2,3',
  'mid-range': '3,4',
  luxury: '4,5',
};

const rateSchema = z
  .object({
    lowest: z.string().optional(),
    extracted_lowest: numericField,
  })
  .optional();

const propertySchema = z.object({
  name: z.string(),
  /** e.g. "hotel", "resort", "vacation rental". */
  type: z.string().optional(),
  description: z.string().optional(),
  extracted_hotel_class: numericField,
  overall_rating: numericField,
  reviews: numericField,
  /** Google's own 0–5 score for how well placed the property is. */
  location_rating: numericField,
  amenities: z.array(z.string()).optional(),
  rate_per_night: rateSchema,
  total_rate: rateSchema,
});

const hotelsResponseSchema = z.object({
  properties: z.array(propertySchema).optional(),
});

/** A stay before it has a photograph. See `withPlaceImages` for why the two are split. */
type HotelDraft = Omit<HotelResult, 'image'>;

const hotelsCache = createTtlCache<HotelDraft[]>();

const serpApiHotelProvider: HotelProvider = {
  name: 'Google Hotels via SerpApi',

  async searchHotels(query: HotelQuery): Promise<HotelResult[]> {
    const destination = query.destination.trim();

    // Google Hotels prices a stay, not a place: without both dates there is
    // nothing to quote. Returning empty rather than inventing a window keeps the
    // model from presenting next month's rates as this trip's — the prompt tells
    // it to ask for dates instead.
    if (!destination || !query.checkIn || !query.checkOut) return [];

    const key = cacheKey(
      'hotels',
      destination,
      query.checkIn,
      query.checkOut,
      query.budgetLevel,
      query.guests,
    );

    const drafts = await cachedList(hotelsCache, key, () => buildHotels(query, destination));
    if (drafts.length === 0) return [];

    return query.withImages === false
      ? drafts.map((draft) => toResult(draft, null))
      : withPlaceImages(drafts, destination, toResult);
  },
};

function toResult(draft: HotelDraft, image: HotelResult['image']): HotelResult {
  return { ...draft, image };
}

type Property = z.infer<typeof propertySchema>;

/** One search, for a stated number of adults in one room. */
async function fetchProperties(
  query: HotelQuery,
  destination: string,
  adults: number,
): Promise<Property[]> {
  const params: Record<string, string> = {
    q: destination,
    check_in_date: query.checkIn ?? '',
    check_out_date: query.checkOut ?? '',
    adults: String(adults),
    currency: PRICE_CURRENCY,
    hl: 'en',
    gl: 'us',
  };

  if (query.budgetLevel) params.hotel_class = BUDGET_HOTEL_CLASS[query.budgetLevel];

  const body = await serpApiSearch(SerpApiEngine.HOTELS, params);
  const parsed = hotelsResponseSchema.safeParse(body);
  return (parsed.success ? parsed.data.properties : undefined) ?? [];
}

function hasRate(property: Property): boolean {
  return property.rate_per_night?.extracted_lowest !== undefined;
}

/**
 * Properties for the party, and how many rooms the rates cover.
 *
 * The whole party is asked about first, because when Google can price it — family
 * rooms and suites exist — that answer is an exact quote for exactly the right thing
 * and nothing needs deriving. Only when it comes back with no rates at all does this
 * fall back to pricing one room and reporting the multiplier, which is the difference
 * between a family seeing no lodging cost and seeing an honest approximation of one.
 *
 * The second search is spent only for parties above a double and only when the first
 * returned nothing priceable, so the common cases still cost one search.
 */
async function fetchForParty(
  query: HotelQuery,
  destination: string,
): Promise<{ properties: Property[]; rooms: number }> {
  const guests = query.guests ?? DEFAULT_GUESTS;
  const asked = await fetchProperties(query, destination, guests);

  if (guests <= MAX_ADULTS_PER_ROOM || asked.some(hasRate)) {
    return { properties: asked, rooms: 1 };
  }

  const rooms = Math.ceil(guests / MAX_ADULTS_PER_ROOM);
  const perRoom = Math.ceil(guests / rooms);
  const split = await fetchProperties(query, destination, perRoom);

  // If splitting prices nothing either, the original answer is no worse and keeps
  // the properties on screen with their ratings and descriptions intact.
  return split.some(hasRate) ? { properties: split, rooms } : { properties: asked, rooms: 1 };
}

/** Scales a single room's quote to the number of rooms the party needs. */
function forRooms(amount: number | undefined, rooms: number): number | null {
  return amount === undefined ? null : Math.round(amount * rooms);
}

/**
 * The four to show, preferring properties Google has a rating for.
 *
 * Order used to be taken as given, because SerpApi returns rated hotels first and
 * the question never came up. Scrapingdog leads with unrated vacation rentals
 * instead, and taking its first four produced a grid of four cards all reading
 * "0 ★ (0 reviews)" — a rating nobody gave, presented as one everybody did, which
 * is worse than an absent one because the card cannot tell them apart.
 *
 * A stable partition rather than a sort, so within each group whatever ranking the
 * upstream applied survives. Unrated properties are kept as filler behind the rated
 * ones, since four real hotels with three shown is better than three.
 */
function preferRated(properties: readonly Property[]): Property[] {
  const rated = properties.filter((property) => property.overall_rating !== undefined);
  const unrated = properties.filter((property) => property.overall_rating === undefined);

  return [...rated, ...unrated].slice(0, MAX_RESULTS);
}

async function buildHotels(query: HotelQuery, destination: string): Promise<HotelDraft[]> {
  const { properties, rooms } = await fetchForParty(query, destination);

  return preferRated(properties).map((property, index) => ({
    id: `hotel-${placeNameKey(property.name) || index}`,
    name: property.name,
    type: property.type?.trim() ?? null,
    pricePerNight: forRooms(property.rate_per_night?.extracted_lowest, rooms),
    totalPrice: forRooms(property.total_rate?.extracted_lowest, rooms),
    rooms,
    currency: PRICE_CURRENCY,
    rating: property.overall_rating ?? 0,
    reviewCount: property.reviews ?? 0,
    stars: property.extracted_hotel_class ?? null,
    locationRating: property.location_rating ?? null,
    amenities: rankAmenities(property.amenities ?? []),
    description: property.description?.trim() ?? null,
    bookingUrl: hotelSearchUrl({
      name: property.name,
      destination,
      checkIn: query.checkIn,
      checkOut: query.checkOut,
    }),
    provider: BookingProvider.HOTELS,
  }));
}

/** Google returns around eighteen; a grid of four is what the conversation shows. */
const MAX_RESULTS = 4;

/**
 * The provider in use. The single seam a different source is swapped in at, and
 * the reason nothing above this file knows which one answered.
 */
export function hotelProvider(): HotelProvider {
  return serpApiHotelProvider;
}
