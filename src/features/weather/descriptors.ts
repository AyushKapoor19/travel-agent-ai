import { monthName } from '@/lib/months';

import { RAIN_BANDS_MM, RAIN_SCORE_CEILING_MM, WETTEST_LABEL } from './constants';
import type { ClimateNormals, ClimatePreference, MonthlyNormal } from './types';
import { CLIMATE_BANDS } from './types';

/**
 * Turning measured numbers into the words a traveller uses, and back.
 *
 * Pure and client-safe: a card renders "warm and dry" from the same function the
 * ranker scores with, so the label on the card can never disagree with the reason
 * the destination was chosen. Two implementations of "what counts as warm" is one
 * of the easier ways to ship a recommendation that contradicts itself.
 */

/**
 * Degrees outside the asked-for band before a month scores nothing on climate —
 * and, because a zero disqualifies, before the destination stops being offered.
 *
 * Eight rather than a rounder ten or twelve, tuned against the case that catches
 * it: "cold" tops out at 10°C, and a wider tolerance let a 21°C February in Hanoi
 * through as a cold-weather suggestion. Eight puts the edge just past a genuine
 * shoulder-season near miss and well short of the wrong hemisphere.
 */
export const CLIMATE_TOLERANCE_C = 8;

/** Reads a month's average high as the word a traveller would use for it. */
export function temperatureWord(highC: number): string {
  if (highC < CLIMATE_BANDS.mild.minHighC) return 'cold';
  if (highC < CLIMATE_BANDS.warm.minHighC) return 'mild';
  if (highC < CLIMATE_BANDS.hot.minHighC) return 'warm';
  return 'hot';
}

/**
 * A month's rain as a band, from its total in millimetres.
 *
 * A band rather than a figure because the underlying measurement does not support
 * a figure; `RAIN_BANDS_MM` has the calibration. This is the only rain wording in
 * the app, so nothing can quote a millimetre count at a traveller by accident.
 */
export function rainWord(precipitationMm: number): string {
  return RAIN_BANDS_MM.find((band) => precipitationMm <= band.maxMm)?.label ?? WETTEST_LABEL;
}

/**
 * How well a month's warmth answers the request, from 1 down to 0.
 *
 * Full marks anywhere inside the band, then a linear falloff outside it rather
 * than a cliff: 18°C is a fair answer to "warm" and should rank below 24°C
 * without being discarded, which is the difference between a ranking and a
 * filter.
 */
export function climateScore(highC: number, preference: ClimatePreference): number {
  const band = CLIMATE_BANDS[preference];
  if (highC >= band.minHighC && highC <= band.maxHighC) return 1;

  const distance = highC < band.minHighC ? band.minHighC - highC : highC - band.maxHighC;
  return Math.max(0, 1 - distance / CLIMATE_TOLERANCE_C);
}

/* -------------------------------------------------------------------------- */
/* Best months, derived rather than declared                                   */
/* -------------------------------------------------------------------------- */

/**
 * The band most people mean by pleasant when they have not said otherwise:
 * warm enough to sit outside, cool enough to walk all day.
 */
const COMFORT_MIN_C = 18;
const COMFORT_MAX_C = 28;

/** Months returned as "best". Three fits a sentence; twelve is not an answer. */
const BEST_MONTH_COUNT = 3;

/**
 * How much rain counts against a month, relative to temperature.
 *
 * Enough to be decisive only when temperature is not. In the tropics every month
 * sits inside the comfortable band, so this is the entire basis for choosing
 * between them; in a temperate place it separates two otherwise equal months
 * without ever promoting a cold dry one over a warm damp one.
 */
const RAIN_WEIGHT = 0.35;

function comfortScore(month: MonthlyNormal, preference: ClimatePreference | undefined): number {
  if (preference) return climateScore(month.avgHighC, preference);

  if (month.avgHighC >= COMFORT_MIN_C && month.avgHighC <= COMFORT_MAX_C) return 1;

  const distance =
    month.avgHighC < COMFORT_MIN_C
      ? COMFORT_MIN_C - month.avgHighC
      : month.avgHighC - COMFORT_MAX_C;
  return Math.max(0, 1 - distance / CLIMATE_TOLERANCE_C);
}

function drynessScore(month: MonthlyNormal): number {
  return 1 - Math.min(1, month.precipitationMm / RAIN_SCORE_CEILING_MM);
}

/**
 * When to go, computed from the measurements instead of asserted.
 *
 * This used to be a hand-written list per destination, which was the least
 * defensible number in the whole dataset — an opinion with no provenance, and one
 * that quietly contradicted the climate table beside it. Deriving it means "the
 * best months to go" and "what the weather is like then" cannot disagree, and it
 * bends to the traveller: someone who asked for cold gets the cold months, not
 * the months a beach holiday would want.
 */
export function bestMonthIndexes(
  normals: ClimateNormals,
  preference?: ClimatePreference,
): number[] {
  return [...normals.months]
    .map((month) => ({
      monthIndex: month.monthIndex,
      score: comfortScore(month, preference) + drynessScore(month) * RAIN_WEIGHT,
    }))
    .sort((a, b) => b.score - a.score || a.monthIndex - b.monthIndex)
    .slice(0, BEST_MONTH_COUNT)
    .map(({ monthIndex }) => monthIndex)
    .sort((a, b) => a - b);
}

/** The same, as names, for prose and for a card. */
export function bestMonthNames(normals: ClimateNormals, preference?: ClimatePreference): string[] {
  return bestMonthIndexes(normals, preference).map(monthName);
}

/** How a measured figure should be described wherever it is shown. */
export function provenanceLabel(normals: ClimateNormals): string {
  const { fromYear, toYear } = normals.window;
  return `${toYear - fromYear + 1}-year average (${fromYear}–${toYear}), ERA5 reanalysis via Open-Meteo`;
}
