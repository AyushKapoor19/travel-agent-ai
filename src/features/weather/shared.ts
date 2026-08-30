/**
 * What a climate is, on either side of the wire.
 *
 * Everything here is safe in a browser bundle: the shape of a normal, the words a
 * card prints for a temperature, and the vocabulary a preference is expressed in.
 * Nothing in it can reach Open-Meteo.
 *
 * The wording functions are shared rather than duplicated so a card's "warm and
 * dry" and the ranker's reason for choosing the place are computed by the same
 * code. Two implementations of what counts as warm is one of the easier ways to
 * ship a recommendation that contradicts its own label.
 *
 * Anything that fetches is in `./server`, which a client component cannot import.
 */

export {
  bestMonthIndexes,
  bestMonthNames,
  climateScore,
  provenanceLabel,
  rainWord,
  temperatureWord,
} from './descriptors';
export type {
  ClimateNormals,
  ClimatePreference,
  ClimateReport,
  GeocodedPlace,
  MonthlyClimate,
  MonthlyNormal,
} from './types';
export { CLIMATE_BANDS, CLIMATE_PREFERENCES, climateReportSchema } from './types';
