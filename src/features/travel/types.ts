import { z } from 'zod';

import { placeImageSchema } from '@/features/photos/shared';
import type { BUDGET_LEVELS } from '@/features/trip/brief';
import type { ClimatePreference } from '@/features/weather/shared';

/**
 * The contract between the agent's tools and whatever supplies travel data.
 *
 * Google's travel surfaces, read through SerpApi, implement it today. The
 * interface is what let that happen without the agent, the prompts or the UI
 * changing when the mock seed data behind it was deleted, and what would let a
 * different vendor replace it the same way.
 */

/**
 * A place to stay, as Google was quoting it for the requested dates.
 *
 * `neighborhood` and `distanceToCenterKm` used to be here and are gone, because
 * Google Hotels reports neither and both were invented by the seed data. What
 * replaced them is reported: `locationRating` is Google's own 0–5 score for how
 * well placed a property is, which is the question the distance was standing in
 * for.
 */
export const hotelResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** e.g. "hotel", "resort", "vacation rental". */
  type: z.string().nullable(),
  /** Lowest nightly rate for the requested dates, for `rooms` rooms. Null when none was quoted. */
  pricePerNight: z.number().nullable(),
  /** The whole stay, which is the figure a budget is actually spent against. */
  totalPrice: z.number().nullable(),
  /**
   * How many rooms the two prices above cover.
   *
   * Almost always one, and the field exists for when it is not. Google Hotels prices
   * a room rather than a party and has no parameter for asking about two, so a family
   * of four came back as real properties with every rate null — Google could not fit
   * them in one room and said nothing instead. The prices then quietly excluded the
   * largest cost of the trip. A party too large for one room is now priced per room
   * and multiplied, and this is what stops that being invisible: a figure covering two
   * rooms must say so, because two rooms at one rate is an assumption about
   * availability rather than a quote.
   */
  rooms: z.number().int().positive(),
  currency: z.string(),
  /** Guest rating out of 5. */
  rating: z.number(),
  reviewCount: z.number(),
  /** Star class, 1–5. Null for properties Google does not classify. */
  stars: z.number().nullable(),
  /** Google's 0–5 score for the quality of the location. */
  locationRating: z.number().nullable(),
  amenities: z.array(z.string()),
  description: z.string().nullable(),
  bookingUrl: z.string(),
  provider: z.string(),
  /**
   * A photo of the property where one exists, and of somewhere else in the city
   * where it does not — Wikipedia has an article for the Ritz-Carlton and none for
   * a guesthouse. The card captions which it got rather than implying the
   * building in the picture is the one being booked.
   */
  image: placeImageSchema.nullable(),
});

/**
 * Something to do, and only what the source actually said about it.
 *
 * Four fields are nullable because Google's local and top-sights results are
 * genuinely silent about them for many places, and the alternative to a null is a
 * number nobody measured. Duration and cancellation terms are absent from the
 * model altogether for the same reason: no source behind this app reports either,
 * and a field that is always null is a worse lie than a field that is not there —
 * it reads on the card as "unknown for this one" rather than "never known".
 */
export const activityResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Google's own classification, e.g. "Tourist attraction". Null when unstated. */
  category: z.string().nullable(),
  /** Entry price, for cost arithmetic. Null when Google lists none; 0 means free. */
  price: z.number().nullable(),
  /**
   * The price exactly as the source wrote it, e.g. "Free" or "$10–20".
   *
   * Kept beside the number because the two carry different information: a band is
   * not roundable to a figure, and "Free" is a fact worth printing rather than a
   * zero to format. The card prefers this; the arithmetic uses `price`.
   */
  priceLabel: z.string().nullable(),
  currency: z.string(),
  rating: z.number(),
  reviewCount: z.number(),
  description: z.string().nullable(),
  bookingUrl: z.string(),
  provider: z.string(),
  /** A photo of the place the activity visits. */
  image: placeImageSchema.nullable(),
});

/**
 * What kind of claim a reason makes, so a surface can skip the ones it already
 * makes for itself.
 *
 * The prose needs every reason — the model is writing a paragraph and the
 * temperature belongs in it. The card does not: it has a temperature badge, a
 * weather line and a cost row of its own, so rendering the climate and cost
 * reasons underneath them printed the same fact twice. Two of Lisbon's three
 * visible reasons were restatements of rows an inch above.
 *
 * Tagged by what a surface would duplicate rather than by which scoring dimension
 * produced it, which is why a rainfall note counts as `climate` even though the
 * seasonal test emitted it. The alternative was the card pattern-matching the
 * ranker's wording, which couples the two and breaks silently when either changes.
 */
export const REASON_KINDS = ['climate', 'season', 'cost'] as const;

export type ReasonKind = (typeof REASON_KINDS)[number];

export const destinationReasonSchema = z.object({
  kind: z.enum(REASON_KINDS),
  text: z.string(),
});

export type DestinationReason = z.infer<typeof destinationReasonSchema>;

/**
 * A destination the traveller might be sent to, and the evidence for sending
 * them there.
 *
 * Two kinds of claim, kept apart on purpose. `summary` is the model's — its
 * characterisation of what a place is like, which is the one thing here a language
 * model is genuinely the best available source for. Everything else is measured:
 * the temperatures come from the archive, the rates from what Google is quoting
 * for those dates, the highlights from the sights actually listed for the city.
 *
 * `reasons` is the load-bearing field and it holds only the measured kind. A
 * recommendation the traveller cannot argue with is not a recommendation, it is a
 * guess with confidence — so every line in it is derived from a number some
 * provider returned, and none of it is the model restating its own suggestion as
 * evidence for itself.
 */
export const destinationSuggestionSchema = z.object({
  id: z.string(),
  city: z.string(),
  /** From the geocoder rather than the proposal, so it reflects what was measured. */
  country: z.string(),
  /** The model's read on the place. The only unmeasured prose in the object. */
  summary: z.string(),
  /** Grounds it was chosen on, each derived from a provider's number. */
  reasons: z.array(destinationReasonSchema),
  /** Null when the archive could not resolve the place, or no month is known. */
  weather: z
    .object({
      month: z.string(),
      highC: z.number(),
      lowC: z.number(),
      /** A band, never a millimetre count. See `rainWord`. */
      rain: z.string(),
      /** Plain-language read on the month, e.g. "warm and dry". */
      summary: z.string(),
      /** What the figures are, so nothing can quote them as a forecast. */
      source: z.string(),
    })
    .nullable(),
  /**
   * What somewhere to sleep actually costs, and nothing more.
   *
   * Scoped to lodging because lodging is the only part we can price. The figure
   * this replaced was a daily all-in rate typed per city, which quietly covered
   * food and local transport that no provider here reports — the honest version is
   * a narrower claim with a real number behind it. Null when no dates are known or
   * nothing was quoted.
   */
  cost: z
    .object({
      /** The lowest nightly rate quoted, which is what "from" means. */
      nightlyFromUsd: z.number(),
      stayTotalUsd: z.number().nullable(),
      nights: z.number().nullable(),
      currency: z.string(),
      /** How many properties the figure was drawn from. */
      sampledProperties: z.number(),
    })
    .nullable(),
  /** Real sights listed for the city, by name. Empty when none came back. */
  highlights: z.array(z.string()),
  /** Best months by name, derived from the measurements, for "go in May instead". */
  bestMonths: z.array(z.string()),
  image: placeImageSchema.nullable(),
});

export type HotelResult = z.infer<typeof hotelResultSchema>;
export type ActivityResult = z.infer<typeof activityResultSchema>;
export type DestinationSuggestion = z.infer<typeof destinationSuggestionSchema>;

/**
 * Derived from the brief's vocabulary rather than restated, so a budget level the
 * conversation can produce is always one a provider can be asked for.
 */
export type BudgetLevel = (typeof BUDGET_LEVELS)[number];

/**
 * Whether the caller is building cards or just reading numbers.
 *
 * Photographs are per-result and come from Wikipedia, which rate-limits. The
 * destination shortlist prices rooms in five cities purely to compare them, and
 * enriching all of that cost forty lookups for images nobody would ever see — and
 * got us refused on the three that were actually going on screen. Defaults to
 * fetching them, so anything rendering a card needs to know nothing about this.
 */
type ImageOption = {
  withImages?: boolean;
};

export type HotelQuery = ImageOption & {
  destination: string;
  checkIn?: string;
  checkOut?: string;
  budgetLevel?: BudgetLevel;
  guests?: number;
};

export type ActivityQuery = ImageOption & {
  destination: string;
  /**
   * The country the destination is in, when known.
   *
   * Worth passing whenever it is: Google's local pack returns markedly more
   * results for a qualified place than a bare one, and it disambiguates the same
   * way a country hint does for the geocoder.
   */
  country?: string;
  category?: string;
  limit?: number;
};

export type HotelProvider = {
  name: string;
  searchHotels(query: HotelQuery): Promise<HotelResult[]>;
};

export type ActivityProvider = {
  name: string;
  searchActivities(query: ActivityQuery): Promise<ActivityResult[]>;
};

/**
 * A place the model has put forward, before anything has been checked about it.
 *
 * The city and country are a lookup key, not an answer — they are what gets
 * geocoded and priced. `why` is the model's reason for proposing it and travels
 * through to `summary` untouched, never into `reasons`.
 */
export type DestinationCandidate = {
  city: string;
  country: string;
  /** One line on what makes it fit. The only part not subsequently verified. */
  why: string;
};

/**
 * What to check, and what the traveller wanted.
 *
 * `candidates` is the inversion this type exists to express. It used to be absent,
 * because the answers came from a file of sixteen cities and the query's job was to
 * filter it — which meant the set of places this app could ever suggest was a
 * literal list, and asking for Croatia got you silence. Now the model proposes and
 * this layer verifies: breadth comes from the model, truth from the providers, and
 * neither is asked to do the other's job.
 *
 * Everything else stays optional, because the whole point is answering "where
 * should I go" from a partial picture — someone who has said only "somewhere warm"
 * still deserves an answer.
 */
export type DestinationQuery = {
  readonly candidates: readonly DestinationCandidate[];
  climate?: ClimatePreference;
  budgetLevel?: BudgetLevel;
  /** A hard ceiling in USD, e.g. "under $2000". Reported against, never silently applied. */
  maxTotalUsd?: number;
  /** Month index the trip starts, 0-based. */
  monthIndex?: number;
  /** Both needed to price a stay: a nightly rate only means anything for real dates. */
  checkIn?: string;
  checkOut?: string;
  nights?: number;
  travelers?: number;
  /** How many to return. The prompt asks for two or three. */
  limit?: number;
};

/**
 * Why a proposal never became a suggestion.
 *
 * Only genuine verification failures, which is the whole point of naming them. A
 * candidate that resolved and priced perfectly well but placed fourth is not
 * rejected, and reporting it as though it were teaches the model to explain a
 * ranking as a data problem — it told a traveller that Cádiz "dropped off during
 * climate and pricing checks" when Cádiz had passed both.
 *
 * `unavailable` is the same mistake caught a second time, one layer down. It used
 * to be reported as `unmappable`, so a climate archive that was merely rate-limited
 * read as a name nobody could place — and the model, correctly describing what it
 * had been handed, told a traveller Rome could not be verified. Two of these are
 * facts about the destination and one is a fact about our afternoon.
 */
export const REJECTION_REASONS = ['unmappable', 'wrong-climate', 'unavailable'] as const;

export const rejectedCandidateSchema = z.object({
  city: z.string(),
  reason: z.enum(REJECTION_REASONS),
});

export type RejectedCandidate = z.infer<typeof rejectedCandidateSchema>;

export type DestinationShortlist = {
  destinations: DestinationSuggestion[];
  rejected: RejectedCandidate[];
};

export type DestinationProvider = {
  name: string;
  recommendDestinations(query: DestinationQuery): Promise<DestinationShortlist>;
};

/* -------------------------------------------------------------------------- */
/* Flights                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * One itinerary, at the price the whole party would pay.
 *
 * `priceUsd` is a party total rather than a per-passenger fare, which was checked
 * against the API rather than assumed. Lodging and admission are party totals here
 * too, so the three add up without anything being scaled — and a per-passenger fare
 * quietly mixed in would have made the trip total wrong by the size of the party.
 */
export const flightFareSchema = z.object({
  id: z.string(),
  priceUsd: z.number(),
  currency: z.string(),
  /** Deduplicated across legs, so one carrier on two legs reads as one airline. */
  airlines: z.array(z.string()),
  /** Door to door, in minutes. Null when Google does not report it. */
  durationMinutes: z.number().nullable(),
  stops: z.number(),
  roundTrip: z.boolean(),
  /** Google's own search, since a fare is only bookable through the live page. */
  bookingUrl: z.string().nullable(),
});

export type FlightFare = z.infer<typeof flightFareSchema>;

/**
 * Google's assessment of the fare, which is the rarest thing in this codebase: a
 * judgement that arrives measured.
 *
 * "Is this a good time to book" is exactly the question a travel agent is asked and
 * exactly the one a language model cannot answer honestly. Google compares the fare
 * against its own history for the route and season, so `level` is a verdict with
 * provenance — and it is passed through verbatim rather than reworded, because
 * "typical" is Google's word for a band it can define and ours for nothing.
 */
export const fareInsightSchema = z.object({
  lowestUsd: z.number(),
  /** Google's own wording, e.g. "low", "typical", "high". */
  level: z.string(),
  typicalLowUsd: z.number().nullable(),
  typicalHighUsd: z.number().nullable(),
});

export type FareInsight = z.infer<typeof fareInsightSchema>;

export const flightSearchSchema = z.object({
  fares: z.array(flightFareSchema),
  insight: fareInsightSchema.nullable(),
  searchUrl: z.string().nullable(),
});

export type FlightSearch = z.infer<typeof flightSearchSchema>;

export type FlightQuery = {
  /** IATA code, e.g. "JFK". Validated before anything is sent. */
  origin: string;
  destination: string;
  departDate: string;
  /** Absent means one way, which is a different trip at a different price. */
  returnDate?: string;
  travelers?: number;
};

export type FlightProvider = {
  name: string;
  searchFlights(query: FlightQuery): Promise<FlightSearch>;
};

/* -------------------------------------------------------------------------- */
/* Costs                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * What a trip can be shown to cost at least.
 *
 * A floor, and the type is built to keep it one. Two of the four things a trip
 * actually costs have no source behind this app — nobody here reports what dinner
 * costs in Lisbon or what the metro charges — and the tempting move is a per-diem
 * that turns a floor into a total. That would be the one invented number in an app
 * whose entire premise is that every figure is quoted, and it would be the number
 * travellers act on.
 *
 * So the excluded categories are part of the payload rather than a caveat in the
 * prompt: a consumer cannot render this without being handed the list of what is
 * missing from it.
 */
export const costEstimateSchema = z.object({
  destination: z.string(),
  currency: z.string(),
  nights: z.number().nullable(),
  travelers: z.number(),

  /**
   * A real quote for these dates, for a property that actually exists in the results.
   *
   * `basis` is here because the first version always priced the cheapest room and the
   * prose did not. The itinerary recommended a $66 room while the total was built from
   * a $47 one, so the trip's floor came out *below* the stay named five lines above it
   * — arithmetic nobody could follow and every figure in it true. The caller can now
   * name the property it is recommending; this says which of the two happened.
   */
  lodging: z
    .object({
      property: z.string(),
      nightlyUsd: z.number(),
      stayTotalUsd: z.number(),
      basis: z.enum(['recommended', 'cheapest']),
      /** Rooms the figures cover. Above one, the rate is multiplied rather than quoted. */
      rooms: z.number().int().positive(),
    })
    .nullable(),

  /**
   * Entry prices, multiplied by the party — unlike a room, admission is per head.
   *
   * `unpriced` is as load-bearing as the total: Google lists no price for most
   * restaurants and many attractions, so a figure covering three of nine places
   * would read as complete without it.
   */
  activities: z
    .object({
      entryTotalUsd: z.number(),
      priced: z.number(),
      free: z.number(),
      unpriced: z.number(),
    })
    .nullable(),

  /**
   * The cheapest real fare for the party, when a route could be priced.
   *
   * The largest line in most trips and the last one to get a source. It is only ever
   * present when both airport codes were supplied and Google quoted the route — a
   * plausible fare would be worse than none, because this is the figure that decides
   * whether a trip is affordable at all.
   */
  flights: z
    .object({
      originAirport: z.string(),
      destinationAirport: z.string(),
      totalUsd: z.number(),
      roundTrip: z.boolean(),
      /** Google's verdict on that fare, when it offered one. */
      level: z.string().nullable(),
    })
    .nullable(),

  /** The lines above, added up. Never a trip total: see `excluded`. */
  measuredTotalUsd: z.number(),

  /** Real costs with no source here. Present so nothing can quietly omit them. */
  excluded: z.array(z.string()),

  /**
   * How the floor sits against a stated ceiling.
   *
   * Asymmetric on purpose, because the arithmetic is. A floor above the ceiling
   * proves the trip is over budget; a floor below it proves nothing at all, since
   * flights and food come out of what is left. Only the provable direction gets a
   * boolean — a `withinBudget: true` here would be read as a promise.
   */
  budget: z
    .object({
      ceilingUsd: z.number(),
      /** Ceiling less the floor. What flights, food and transport must fit inside. */
      unallocatedUsd: z.number(),
      alreadyExceeded: z.boolean(),
    })
    .nullable(),
});

export type CostEstimate = z.infer<typeof costEstimateSchema>;

export type CostQuery = {
  destination: string;
  country?: string;
  /** Both needed for lodging: an undated rate is not a rate. */
  checkIn?: string;
  checkOut?: string;
  nights?: number;
  travelers?: number;
  budgetLevel?: BudgetLevel;
  /** Reported against, never used to filter. */
  maxTotalUsd?: number;
  /** Interest to price entry for, matching what the itinerary would suggest. */
  category?: string;
  limit?: number;
  /**
   * Airport codes, so the fare can be included rather than excluded.
   *
   * Both or neither: a route needs two ends. Absent, flights stay in the excluded
   * list, which is the honest outcome when nobody has said where they are flying from.
   */
  originAirport?: string;
  destinationAirport?: string;
  /**
   * The name of the stay being recommended, so the total is for the trip on the page.
   *
   * A name and deliberately not a price: the rate is still looked up from what the
   * provider quoted, so nothing here trusts a figure a model typed. Unmatched names
   * fall back to the cheapest room rather than failing, and `basis` reports which.
   */
  lodgingProperty?: string;
};

export type CostProvider = {
  name: string;
  estimateCosts(query: CostQuery): Promise<CostEstimate>;
};
