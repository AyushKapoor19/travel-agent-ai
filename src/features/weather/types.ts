import { z } from 'zod';

import { MONTHS_PER_YEAR } from '@/lib/months';

/**
 * What a traveller means by the weather they want, as a band of daytime highs.
 *
 * The bounds overlap on purpose. Someone asking for "warm" and someone asking
 * for "hot" will both accept 29°C, and a ranker that treated the bands as
 * disjoint would rule out the obvious answer on a one-degree technicality.
 *
 * Owned here rather than by `travel/` because this is the bridge between a word
 * and a temperature, and the temperature is what this feature measures.
 */
export const CLIMATE_BANDS = {
  cold: { label: 'cold', minHighC: -30, maxHighC: 10 },
  mild: { label: 'mild', minHighC: 10, maxHighC: 22 },
  warm: { label: 'warm', minHighC: 19, maxHighC: 31 },
  hot: { label: 'hot', minHighC: 28, maxHighC: 55 },
} as const;

export const CLIMATE_PREFERENCES = ['cold', 'mild', 'warm', 'hot'] as const;

export type ClimatePreference = (typeof CLIMATE_PREFERENCES)[number];

/* -------------------------------------------------------------------------- */
/* Places                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A place name resolved to a point on the globe.
 *
 * `name` and `country` come back from the geocoder rather than being echoed from
 * the query, so a card can show what was actually measured. Asking for "Lisbon"
 * and being answered about Lisbon, North Dakota is a thing that happens, and it
 * should be visible when it does.
 */
export type GeocodedPlace = {
  readonly name: string;
  readonly country: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly timezone: string;
  readonly population: number | null;
};

/** Open-Meteo's geocoding response, narrowed to the fields we rely on. */
export const geocodingResponseSchema = z.object({
  results: z
    .array(
      z.object({
        name: z.string(),
        latitude: z.number(),
        longitude: z.number(),
        country: z.string().optional(),
        timezone: z.string().optional(),
        population: z.number().optional(),
        feature_code: z.string().optional(),
      }),
    )
    .optional(),
});

/* -------------------------------------------------------------------------- */
/* Normals                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * One month of a place's climate, averaged over the window.
 *
 * Rain is a monthly total in millimetres, and everything user-facing turns it
 * into a band via `rainWord`. A count of rainy days would read better and cannot
 * be measured honestly from this source — see `RAIN_BANDS_MM` for the calibration
 * that settled it.
 */
export type MonthlyNormal = {
  readonly monthIndex: number;
  readonly avgHighC: number;
  readonly avgLowC: number;
  readonly precipitationMm: number;
};

/**
 * A place's climate, measured rather than asserted.
 *
 * The window travels with the numbers so the UI can say what they are — a
 * ten-year average, not a forecast and not a guarantee. Every honesty rule in
 * the prompts depends on being able to state the provenance of a number, and a
 * bare figure with no window is exactly the kind of claim we ask the model not
 * to make.
 */
export type ClimateNormals = {
  readonly place: GeocodedPlace;
  /** Twelve entries, January first, index matching `monthIndex`. */
  readonly months: readonly MonthlyNormal[];
  readonly window: { readonly fromYear: number; readonly toYear: number };
};

/** Open-Meteo's archive response, narrowed to the daily series we average. */
export const archiveResponseSchema = z.object({
  daily: z.object({
    time: z.array(z.string()),
    temperature_2m_max: z.array(z.number().nullable()),
    temperature_2m_min: z.array(z.number().nullable()),
    precipitation_sum: z.array(z.number().nullable()),
  }),
});

/**
 * The shape a tool hands back to the model for a single month.
 *
 * Flatter and wordier than `MonthlyNormal` because the consumer is a language
 * model writing prose, not a component reading fields: `month: "March"` and an
 * explicit `source` line survive being summarised, where an index and an
 * out-of-band provenance note do not.
 *
 * `rain` is the band rather than the millimetres for the same reason. Handed a
 * number, a model will faithfully repeat it to one decimal place; handed "mostly
 * dry", it can only be as precise as the measurement actually is.
 */
export const monthlyClimateSchema = z.object({
  month: z.string(),
  avgHighC: z.number(),
  avgLowC: z.number(),
  rain: z.string(),
});

export type MonthlyClimate = z.infer<typeof monthlyClimateSchema>;

export const climateReportSchema = z.object({
  place: z.string(),
  country: z.string(),
  month: monthlyClimateSchema.nullable(),
  year: z.array(monthlyClimateSchema),
  bestMonths: z.array(z.string()),
  source: z.string(),
});

export type ClimateReport = z.infer<typeof climateReportSchema>;

/** Guards the aggregation: twelve months in, twelve months out. */
export function isCompleteYear(months: readonly MonthlyNormal[]): boolean {
  return months.length === MONTHS_PER_YEAR;
}
