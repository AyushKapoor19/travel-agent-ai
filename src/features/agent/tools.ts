import 'server-only';

import { tool } from 'ai';
import { z } from 'zod';

import { activityProvider } from '@/features/travel/activities';
import { costProvider } from '@/features/travel/costs';
import { destinationProvider } from '@/features/travel/destinations';
import { flightProvider } from '@/features/travel/flights';
import { hotelProvider } from '@/features/travel/hotels';
import {
  activityResultSchema,
  costEstimateSchema,
  destinationSuggestionSchema,
  flightSearchSchema,
  hotelResultSchema,
  rejectedCandidateSchema,
} from '@/features/travel/types';
import { BriefLimits, BUDGET_LEVELS } from '@/features/trip/brief';
import { toClimateReport, weatherProvider } from '@/features/weather/server';
import { CLIMATE_PREFERENCES, climateReportSchema } from '@/features/weather/shared';
import { monthIndexFrom } from '@/lib/months';

import { TOOL_NAMES } from './tool-names';

/**
 * The agent's tools. Inputs are what a language model can reliably supply;
 * outputs are the exact shapes the cards render, so the client never parses prose
 * or JSON out of the model's text.
 *
 * The output schemas are the provider contract, declared rather than merely
 * inferred: today's provider is in this repository and cannot break it, but the
 * whole point of the seam is that tomorrow's is Amadeus answering over HTTP, and
 * a card is a worse place to discover a missing rate than the boundary is.
 */

/** A day's worth of activities. More than this and the grid stops being a choice. */
const MAX_ACTIVITY_RESULTS = 6;

/** Two or three, per the brief. A list of ten is not a recommendation. */
const MAX_DESTINATION_RESULTS = 3;

/** Proposals to hand over. More get ignored, so asking for more wastes a turn. */
const MAX_CANDIDATE_INPUT = 5;

const recommendDestinations = tool({
  description:
    'Check a shortlist of places you are considering, and get back the two or three that hold up. You propose the candidates — that part is yours, and your knowledge of the world is wider than any list here — and this verifies each one: it geocodes the city, measures its climate for the travel month from ten years of observations, prices real rooms for the dates, and looks up the sights actually listed there. Fewer come back than you send, for two different reasons: some cannot be verified at all, which is what `rejected` lists and the only case you may describe as having failed anything, and the rest simply ranked below the best three. Propose four or five. Call this before naming anywhere, and take the weather, costs and highlights from what it returns rather than from your own memory of the place.',
  inputSchema: z.object({
    candidates: z
      .array(
        z.object({
          city: z
            .string()
            .describe('A city or island that can be found on a map, e.g. "Split" or "Bali".'),
          country: z
            .string()
            .describe(
              'The country alone, e.g. "Greece" — not the island, region or a full address. Required: it is what disambiguates the city.',
            ),
          why: z
            .string()
            .describe(
              'One line on what makes it fit this traveller. Your own read on the place, which is what this field is for — its character, what it is like to be there. Do not put temperatures, prices or opening times here; those are measured and will be filled in for you.',
            ),
        }),
      )
      .min(1)
      .max(MAX_CANDIDATE_INPUT)
      .describe(
        'Places you think fit, best first. Spread them: three cities in one country is a narrower answer than three countries.',
      ),
    climate: z
      .enum(CLIMATE_PREFERENCES)
      .optional()
      .describe(
        'The weather they asked for. "Somewhere warm" is warm; do not guess otherwise. Candidates whose measured highs contradict this are dropped, so only set it if they said so.',
      ),
    budgetLevel: z.enum(BUDGET_LEVELS).optional(),
    maxTotalUsd: z
      .number()
      .positive()
      .optional()
      .describe('A stated ceiling in USD, e.g. 2000 for "under $2000". Omit if none was given.'),
    startDate: z
      .string()
      .optional()
      .describe('Trip start as YYYY-MM-DD if known; the month decides the weather measured.'),
    endDate: z
      .string()
      .optional()
      .describe('Trip end as YYYY-MM-DD. Needed with startDate to price rooms at all.'),
    travelers: z
      .number()
      .int()
      .min(BriefLimits.MIN_TRAVELERS)
      .max(BriefLimits.MAX_TRAVELERS)
      .optional(),
  }),
  outputSchema: z.object({
    destinations: z.array(destinationSuggestionSchema),
    /** Zero is a real answer: every candidate may have failed to stand up. */
    count: z.number(),
    /**
     * Only genuine verification failures, so a reason given for one is true.
     *
     * Was every candidate that did not come back, which quietly included the ones
     * that verified fine and placed fourth — and the model duly explained a
     * ranking as a data problem, telling a traveller Cádiz had failed checks it
     * had actually passed.
     */
    rejected: z
      .array(rejectedCandidateSchema)
      .describe(
        'Candidates that could not be verified, and why. "unmappable" means the geocoder could not place the name, so nothing about it could be measured. "wrong-climate" means its measured highs contradict the weather asked for. "unavailable" means a data source of ours did not answer just now — it says nothing whatever about the place, which may be an excellent suggestion, so never name that candidate to the traveller and never attribute it to bookings, availability or their dates. The first two are worth a line if it helps; never give any of these reasons for a place absent from this list.',
      ),
  }),
  execute: async ({ startDate, endDate, ...criteria }) => {
    const monthIndex = startDate ? (monthIndexFrom(startDate) ?? undefined) : undefined;

    const { destinations, rejected } = await destinationProvider().recommendDestinations({
      ...criteria,
      monthIndex,
      checkIn: startDate,
      checkOut: endDate,
      limit: MAX_DESTINATION_RESULTS,
    });

    return { destinations, count: destinations.length, rejected };
  },
});

const getWeather = tool({
  description:
    'Look up what the weather is actually like in a place, from ten years of observations. Call this before making any claim about climate, temperature or the best time to visit — including in follow-ups such as "what about April instead". Returns the month asked about, the whole year for comparison, and the months best suited to the traveller. Never state a temperature this tool has not returned.',
  inputSchema: z.object({
    place: z
      .string()
      .describe(
        'A city or island, e.g. "Lisbon" or "Bali". Regions such as "Tuscany" cannot be measured — name a city instead.',
      ),
    country: z
      .string()
      .optional()
      .describe(
        'The country it is in. Always supply this when known: it is what prevents Bali resolving to a town in India, or San José to California.',
      ),
    month: z
      .string()
      .optional()
      .describe('The month of interest as YYYY-MM-DD, if the traveller has said when.'),
    climate: z
      .enum(CLIMATE_PREFERENCES)
      .optional()
      .describe(
        'The weather they want, so the best months returned are the ones they would enjoy.',
      ),
  }),
  outputSchema: z.object({
    /** Null when the place cannot be resolved, which is an answer rather than an error. */
    climate: climateReportSchema.nullable(),
    place: z.string(),
  }),
  execute: async ({ place, country, month, climate: preference }) => {
    const normals = await weatherProvider().climateFor({ name: place, country });
    if (!normals) return { climate: null, place };

    const monthIndex = month ? (monthIndexFrom(month) ?? undefined) : undefined;
    return { climate: toClimateReport(normals, monthIndex, preference), place };
  },
});

const searchHotels = tool({
  description:
    'Look up real places to stay, with the nightly and total rate Google is quoting for those exact dates. Call this before naming anywhere to sleep or saying what a stay costs. Both dates are required — a rate only means anything for a specific stay — and an empty result means they were missing or nothing was available, so ask rather than estimating.',
  inputSchema: z.object({
    destination: z.string().describe('City or area to search, e.g. "Lisbon".'),
    checkIn: z.string().describe('Check-in date as YYYY-MM-DD. Required.'),
    checkOut: z.string().describe('Check-out date as YYYY-MM-DD. Required.'),
    budgetLevel: z.enum(BUDGET_LEVELS).optional(),
    guests: z
      .number()
      .int()
      .min(BriefLimits.MIN_TRAVELERS)
      .max(BriefLimits.MAX_TRAVELERS)
      .optional(),
  }),
  outputSchema: z.object({
    destination: z.string(),
    hotels: z.array(hotelResultSchema),
  }),
  execute: async ({ destination, checkIn, checkOut, budgetLevel, guests }) => {
    const hotels = await hotelProvider().searchHotels({
      destination,
      checkIn,
      checkOut,
      budgetLevel,
      guests,
    });
    return { destination, hotels };
  },
});

const searchActivities = tool({
  description:
    "Look up real things to do in a destination, from Google's local and top-sights results. Call this before naming anything to do or quoting what it costs. Returns each place's own rating, review count and entry price where Google lists one. Some fields come back empty — say nothing rather than filling them in.",
  inputSchema: z.object({
    destination: z.string().describe('City or area to search.'),
    country: z
      .string()
      .optional()
      .describe(
        'The country it is in. Always supply this when known: it returns considerably more results and stops Bali matching a town in India.',
      ),
    category: z
      .string()
      .optional()
      .describe('Interest to prioritise, e.g. food, culture, nature, nightlife, adventure.'),
    limit: z.number().int().min(1).max(MAX_ACTIVITY_RESULTS).optional(),
  }),
  outputSchema: z.object({
    destination: z.string(),
    /** Null when the model asked for anything, which the heading reads. */
    category: z.string().nullable(),
    activities: z.array(activityResultSchema),
  }),
  execute: async ({ destination, country, category, limit }) => {
    const activities = await activityProvider().searchActivities({
      destination,
      country,
      category,
      limit,
    });
    return { destination, category: category ?? null, activities };
  },
});

const airportCode = z
  .string()
  .regex(/^[A-Za-z]{3}$/)
  .describe('Three-letter IATA airport code, e.g. "JFK", "LIS", "DPS".');

const searchFlights = tool({
  description:
    "Real fares for a route on real dates, from Google Flights, plus Google's own verdict on whether that fare is low, typical or high for the route and season. Give airport codes, not city names: work out the main international airport for each end and pass its IATA code. The prices that come back are for the whole party, not per person. Call it only when the traveller has said where they are flying from — with no origin there is no route, and you must say you cannot check fares rather than estimating any.",
  inputSchema: z.object({
    origin: airportCode,
    destination: airportCode,
    departDate: z.string().describe('Outbound date as YYYY-MM-DD.'),
    returnDate: z
      .string()
      .optional()
      .describe('Return date as YYYY-MM-DD. Omit only for a genuine one-way trip.'),
    travelers: z
      .number()
      .int()
      .min(BriefLimits.MIN_TRAVELERS)
      .max(BriefLimits.MAX_TRAVELERS)
      .optional(),
  }),
  outputSchema: flightSearchSchema.extend({
    origin: z.string(),
    destination: z.string(),
  }),
  execute: async ({ origin, destination, departDate, returnDate, travelers }) => {
    const search = await flightProvider().searchFlights({
      origin,
      destination,
      departDate,
      returnDate,
      travelers,
    });

    return { ...search, origin: origin.toUpperCase(), destination: destination.toUpperCase() };
  },
});

const estimateCosts = tool({
  description:
    'Add up what this trip can be shown to cost, from rates and entry prices that were actually quoted. Call it once, after you have the stays and things to do, so it totals the same city and dates you are planning. What comes back is a floor and not a trip total: it covers the cheapest real room for these dates plus admission where Google lists a price, and it cannot cover flights, food or getting around, because nothing behind this app reports them. Say what it excludes when you give the figure. If a budget ceiling was mentioned, this reports how much is left unallocated against it — a floor under the ceiling does not mean the trip fits, since the flights and the eating come out of what is left, so never tell them it fits.',
  inputSchema: z.object({
    destination: z.string().describe('The city being planned, e.g. "Lisbon".'),
    country: z.string().optional().describe('The country it is in, when known.'),
    checkIn: z
      .string()
      .optional()
      .describe('Check-in as YYYY-MM-DD. Without both dates no lodging can be priced.'),
    checkOut: z.string().optional().describe('Check-out as YYYY-MM-DD.'),
    travelers: z
      .number()
      .int()
      .min(BriefLimits.MIN_TRAVELERS)
      .max(BriefLimits.MAX_TRAVELERS)
      .optional()
      .describe('The party size. Admission is per person, so this changes the total.'),
    budgetLevel: z.enum(BUDGET_LEVELS).optional(),
    maxTotalUsd: z
      .number()
      .positive()
      .optional()
      .describe('The ceiling from the brief, if one was stated. Reported against, never applied.'),
    category: z
      .string()
      .optional()
      .describe('The interest whose entry prices to total, matching what you are suggesting.'),
    limit: z.number().int().min(1).max(MAX_ACTIVITY_RESULTS).optional(),
    lodgingProperty: z
      .string()
      .optional()
      .describe(
        'The exact name of the stay you are recommending, from the hotel results. Pass it so the total is for the trip you are actually proposing rather than for the cheapest room. Its rate is looked up here — never pass a price.',
      ),
    originAirport: airportCode
      .optional()
      .describe(
        'IATA code they are flying from, when the brief says. Pass it with destinationAirport and the fare is included in the total instead of excluded from it.',
      ),
    destinationAirport: airportCode
      .optional()
      .describe('IATA code they are flying to. Only useful alongside originAirport.'),
  }),
  outputSchema: costEstimateSchema,
  execute: async (query) => costProvider().estimateCosts(query),
});

export const travelTools = {
  [TOOL_NAMES.RECOMMEND_DESTINATIONS]: recommendDestinations,
  [TOOL_NAMES.GET_WEATHER]: getWeather,
  [TOOL_NAMES.SEARCH_HOTELS]: searchHotels,
  [TOOL_NAMES.SEARCH_ACTIVITIES]: searchActivities,
  [TOOL_NAMES.SEARCH_FLIGHTS]: searchFlights,
  [TOOL_NAMES.ESTIMATE_COSTS]: estimateCosts,
};

export type TravelTools = typeof travelTools;
