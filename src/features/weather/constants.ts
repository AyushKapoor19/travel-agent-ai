import { MS_PER_MINUTE, MS_PER_SECOND } from '@/lib/time';

/**
 * Every tunable in the climate pipeline, with the reasoning attached.
 *
 * Two Open-Meteo endpoints back this: one turns a place name into coordinates,
 * the other returns a decade of daily observations we average into normals.
 * Neither needs a key or an account, which is why they were chosen over the
 * commercial weather APIs — a demo nobody can run is worse than one with fewer
 * providers.
 */

/** Place name to coordinates. No key, no account. */
export const GEOCODING_API_URL = 'https://geocoding-api.open-meteo.com/v1/search';

/**
 * Historical daily observations, reanalysis-backed (ERA5).
 *
 * The forecast endpoint would be the wrong source: a trip three months out has
 * no forecast, and "what is Lisbon like in March" is a question about climate,
 * not weather. Averaging real observed years answers it honestly.
 */
export const ARCHIVE_API_URL = 'https://archive-api.open-meteo.com/v1/archive';

/**
 * Open-Meteo asks non-commercial users to identify themselves. Add a contact
 * address before running this anywhere public.
 */
export const USER_AGENT = 'WayfareTravelAgent/0.1 (self-hosted travel planning demo)';

/* -------------------------------------------------------------------------- */
/* The averaging window                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Years averaged into a normal.
 *
 * Ten is the shortest window that still smooths out a single freak year. Thirty
 * is the meteorological convention and would triple the cost to sharpen a figure
 * this app only ever shows rounded to a whole degree.
 *
 * The cost is not the 100 kB. Open-Meteo weights a request by how much data it
 * moves — roughly `variables / 10 * days / 14` — so a decade of three daily
 * variables counts as about 78 calls against the free tier's 10,000 a day rather
 * than as one. That is ~128 unseen places a day, which is ample behind a cache
 * and would not be if this were widened much further.
 */
export const NORMALS_YEARS = 10;

/**
 * The archive lags real time by a few days, so the current year is always
 * partial. Ending on the last completed calendar year keeps every month in the
 * window backed by the same number of years — otherwise a trip in November
 * would average one fewer year than a trip in January and nobody would know.
 */
export const NORMALS_END_YEAR_OFFSET = 1;

/**
 * Rain is reported as a band of monthly millimetres, not as a count of rainy days.
 *
 * This is the one place the source's accuracy forced the data model. ERA5's
 * temperatures are excellent — Lisbon's monthly highs land within a few tenths of
 * published station normals. Its precipitation is not, and it fails in a way that
 * a day count makes worse: because the grid mean smears convective rain into a
 * light drizzle over many cells, counting days above 1 mm gives Denpasar 18 rainy
 * days in July against 3 observed, while the same threshold is nearly exact for
 * Lisbon and London. Raising the threshold inverts the problem rather than fixing
 * it. There is no globally correct cutoff, only a choice of which climates to be
 * wrong about.
 *
 * Monthly totals are the more robust signal, but still land around a third off at
 * a point location, so quoting "9.4 rainy days" would be false precision either
 * way. A four-way band survives that error nearly always, says the thing a
 * traveller actually wants, and cannot be read as a promise.
 */
export const RAIN_BANDS_MM = [
  { maxMm: 30, label: 'dry' },
  { maxMm: 75, label: 'mostly dry' },
  { maxMm: 150, label: 'some rain' },
] as const;

export const WETTEST_LABEL = 'wet';

/**
 * Monthly millimetres at which the dryness score bottoms out, for ranking.
 *
 * A ceiling rather than a cutoff, and set past the wettest band so the scale stays
 * monotonic over everything a traveller would consider. The first attempt clamped
 * partway up the range, which made every month of a tropical wet season tie on
 * zero — the ranking then fell through to calendar order and offered Bali's
 * wettest month as one of its best.
 */
export const RAIN_SCORE_CEILING_MM = 200;

/* -------------------------------------------------------------------------- */
/* Talking to the API                                                         */
/* -------------------------------------------------------------------------- */

export const API_TIMEOUT_MS = 12 * MS_PER_SECOND;

/**
 * Generous, because the failure this absorbs is a queue and not a fault.
 *
 * A 429 here means somebody else's request is still in flight, which resolves in
 * a second or two. Giving up on it costs the weather line on a card; waiting costs
 * a second nobody is watching, because the model is still writing.
 */
export const API_RETRIES = 4;
export const API_BACKOFF_BASE_MS = 800;
export const API_BACKOFF_MAX_MS = 6 * MS_PER_SECOND;

/**
 * A pause after each call, because the free tier allows exactly one at a time.
 *
 * Open-Meteo serialises per IP: one request runs, up to five queue, and the sixth
 * is refused. Every call therefore goes through a single chain in `open-meteo.ts`
 * rather than a worker pool — a pool would be four requests racing for one slot,
 * which is how a batch of five candidates turns into three 429s and two answers.
 * The gap on top keeps a long conversation from sitting permanently at the front
 * of that queue.
 */
export const MIN_REQUEST_GAP_MS = 120;

/* -------------------------------------------------------------------------- */
/* Caching                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A ten-year average does not move, so the only reason to expire it is to bound
 * the process's memory over a long uptime. A day is far longer than any session
 * and short enough that a redeploy is not the only thing that clears it.
 */
export const NORMALS_TTL_MS = 24 * 60 * MS_PER_MINUTE;

/** Short, so one transient failure does not leave a place blank for long. */
export const NORMALS_MISS_TTL_MS = 2 * MS_PER_MINUTE;

/**
 * Places held per process. Each is twelve small rows once averaged — the
 * hundred-kilobyte response is discarded — so this is kilobytes, not megabytes.
 */
export const NORMALS_CACHE_MAX = 256;

/**
 * Where the normals cache is kept between restarts, and deliberately not under
 * `.next`.
 *
 * A normal costs roughly 78 of the free tier's 10,000 daily calls to fetch and is
 * then immutable, so re-fetching one is the most wasteful thing this app can do.
 * A process-local cache re-fetches every place on every restart, which is how a
 * day of development exhausted the daily allowance and left the destination
 * shortlist with no climate for anything. `.next` is not a safe home for it
 * because clearing that directory is a routine fix for unrelated problems.
 */
export function normalsStorePath(): string {
  return process.env.WEATHER_NORMALS_CACHE ?? `${process.cwd()}/.cache/weather-normals.json`;
}

/** Long enough to fold a shortlist's five places into a single write. */
export const NORMALS_STORE_DEBOUNCE_MS = 2 * MS_PER_SECOND;

/** Longest place name we will send to the geocoder. */
export const MAX_PLACE_NAME_LENGTH = 120;
