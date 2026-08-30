import 'server-only';

/**
 * The pipeline itself: resolving a place, and averaging a decade of its weather.
 *
 * `server-only` is load-bearing rather than decorative. The cache and the
 * in-flight map here are process-wide state that only means anything on one
 * server; a copy per browser tab would dedupe nothing and cache nothing, while
 * shipping the transport and its retry ladder into the bundle for no reason.
 *
 * The internals stay unexported. Callers want a place's climate or a report about
 * it; the geocoder's preference for populated places and the archive's missing
 * days are nobody else's problem.
 */

export type { ClimateBatch, PlaceQuery, WeatherProvider } from './climate';
export { toClimateReport, weatherProvider } from './climate';
export { normalsWindow } from './normals';
