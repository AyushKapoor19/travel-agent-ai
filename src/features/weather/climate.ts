import 'server-only';

import { shortCountryName } from '@/lib/countries';
import { monthName } from '@/lib/months';

import { climateKey, readNormals, writeNormals } from './cache';
import { bestMonthNames, provenanceLabel, rainWord } from './descriptors';
import { TransientWeatherError, UnknownPlaceError } from './errors';
import { aggregateNormals, normalsWindow } from './normals';
import { fetchDailySeries, geocodePlace } from './open-meteo';
import type {
  ClimateNormals,
  ClimatePreference,
  ClimateReport,
  GeocodedPlace,
  MonthlyClimate,
  MonthlyNormal,
} from './types';
import { isCompleteYear } from './types';

/**
 * A place's real climate, on demand.
 *
 * Every number this returns was measured. There is no fallback table and no
 * hand-written normal to fall back to, which is a deliberate constraint rather
 * than an omission: a made-up figure and a measured one are indistinguishable
 * once they are on a card, so the only safe answer when the archive is
 * unreachable is no answer at all. Callers must handle null, and the UI omits the
 * weather line rather than inventing one.
 */

/**
 * A place to measure, with the country that disambiguates it.
 *
 * The country is optional but strongly wanted: it is what turns a wrong answer
 * into no answer, and anything proposing a destination knows which country it is
 * in. Callers key their own results off `name`, so it stays whatever they asked
 * for rather than whatever the geocoder called it.
 */
export type PlaceQuery = {
  readonly name: string;
  readonly country?: string;
};

/**
 * Requests in flight, so a batch that names the same place twice fetches once.
 *
 * Not an optimisation so much as a correctness measure for the recommendation
 * path: three candidates resolved concurrently would otherwise each start their
 * own hundred-kilobyte download, and a follow-up arriving mid-flight would start
 * a fourth.
 */
const inFlight = new Map<string, Promise<ClimateOutcome>>();

/**
 * No climate, and which of the two reasons it is.
 *
 * The distinction exists because callers say different things about them and one
 * of those things is a claim about the place. Nothing came back for Rome the
 * afternoon Open-Meteo's daily quota ran out, and the shortlist reported it the
 * only way it could — as a name the geocoder could not place, which is how a
 * traveller ends up being told that Rome could not be verified.
 */
type ClimateOutcome = {
  readonly normals: ClimateNormals | null;
  /**
   * Where the place is, whenever the geocoder got that far.
   *
   * Present without `normals` in exactly one situation, and it is the situation
   * that matters: the name resolved and the archive then declined to answer. The
   * two steps fail independently and are metered separately, so an exhausted
   * archive quota leaves geocoding working — and a caller handed only "no climate"
   * cannot tell that apart from a place nobody could find, so it threw away a
   * perfectly good set of coordinates and dropped the destination with them.
   */
  readonly place: GeocodedPlace | null;
  /** True when the archive could not answer, rather than the place not existing. */
  readonly unavailable: boolean;
};

async function load(query: PlaceQuery): Promise<ClimateOutcome> {
  const { fromYear, toYear } = normalsWindow();
  let resolved: GeocodedPlace | null = null;

  try {
    resolved = await geocodePlace(query.name, query.country);
    const series = await fetchDailySeries(resolved, fromYear, toYear);
    const months = aggregateNormals(series);

    if (!isCompleteYear(months)) {
      throw new TransientWeatherError(`Archive returned ${months.length} months for ${query.name}`);
    }

    const normals: ClimateNormals = {
      place: resolved,
      months,
      window: { fromYear, toYear },
    };

    writeNormals(query.name, query.country, normals);
    return { normals, place: resolved, unavailable: false };
  } catch (error) {
    // A place that does not exist will not start existing, so that answer is worth
    // remembering.
    if (error instanceof UnknownPlaceError) {
      writeNormals(query.name, query.country, null);
      return { normals: null, place: null, unavailable: false };
    }

    // Everything else is this side failing rather than the place failing to exist:
    // a rate limit, a spent allowance, a dropped connection, a shape we did not
    // expect. Not cached, because caching it would answer for the place long after
    // the archive recovered, and not reported as a fact about the place either.
    // `resolved` survives when the geocoder had already answered.
    return { normals: null, place: resolved, unavailable: true };
  }
}

async function outcomeFor(query: PlaceQuery): Promise<ClimateOutcome> {
  const cached = readNormals(query.name, query.country);
  // A cached null is only ever written for a place the geocoder rejected, so it is
  // an answer about the place rather than an outage being remembered.
  if (cached) {
    return {
      normals: cached.normals,
      place: cached.normals?.place ?? null,
      unavailable: false,
    };
  }

  const key = climateKey(query.name, query.country);
  const existing = inFlight.get(key);
  if (existing) return existing;

  const request = load(query).finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}

async function climateFor(query: PlaceQuery): Promise<ClimateNormals | null> {
  return (await outcomeFor(query)).normals;
}

/**
 * Resolves a batch, keyed on the name the caller asked with.
 *
 * Deliberately sequential. The obvious worker pool was the first thing written
 * here and it made things worse: the free tier runs one request per IP and refuses
 * anything past a short queue, so four workers meant four requests contending for
 * one slot and three of five candidates coming back empty. Awaiting each in turn
 * is both simpler and strictly faster, because none of the work is wasted.
 *
 * Cached places cost nothing, so a follow-up about the same shortlist returns
 * immediately regardless of its length.
 */
async function climateForMany(queries: readonly PlaceQuery[]): Promise<ClimateBatch> {
  const unique = new Map<string, PlaceQuery>();
  for (const query of queries) {
    const name = query.name.trim();
    if (name) unique.set(climateKey(name, query.country), { ...query, name });
  }

  const found = new Map<string, ClimateNormals>();
  const located = new Map<string, GeocodedPlace>();
  const unavailable = new Set<string>();

  for (const query of unique.values()) {
    const outcome = await outcomeFor(query);

    if (outcome.normals) {
      found.set(query.name, outcome.normals);
      continue;
    }

    if (outcome.unavailable) unavailable.add(query.name);
    if (outcome.place) located.set(query.name, outcome.place);
  }

  return { found, located, unavailable };
}

/* -------------------------------------------------------------------------- */
/* The shape the model reads                                                   */
/* -------------------------------------------------------------------------- */

function toMonthlyClimate(month: MonthlyNormal): MonthlyClimate {
  return {
    month: monthName(month.monthIndex),
    avgHighC: month.avgHighC,
    avgLowC: month.avgLowC,
    rain: rainWord(month.precipitationMm),
  };
}

/**
 * A report the model can narrate without being able to overstate it.
 *
 * The whole year travels alongside the month asked about, because follow-ups are
 * the norm — "what about April instead" should not cost another round trip — and
 * the provenance line travels with both, so a sentence about the weather can
 * always be attributed to a decade of observations rather than to the model.
 */
export function toClimateReport(
  normals: ClimateNormals,
  monthIndex: number | undefined,
  preference?: ClimatePreference,
): ClimateReport {
  const month = monthIndex === undefined ? null : (normals.months[monthIndex] ?? null);

  return {
    place: normals.place.name,
    // The geocoder's official English, shortened: a card reading "Republic of
    // Türkiye" looks like a bug to the traveller reading it.
    country: shortCountryName(normals.place.country),
    month: month ? toMonthlyClimate(month) : null,
    year: normals.months.map(toMonthlyClimate),
    bestMonths: bestMonthNames(normals, preference),
    source: provenanceLabel(normals),
  };
}

/**
 * A batch's answers, and the places there is simply no answer for yet.
 *
 * `unavailable` is deliberately not folded into `found` as a null. A caller that
 * cannot tell the two apart has to describe them with one sentence, and the only
 * sentence that covers both is a claim about the place.
 *
 * `located` is the same argument taken one step further. A place whose name
 * resolved but whose climate the archive would not serve is not a dead end: its
 * coordinates are known, so its rooms can still be priced, its sights still
 * looked up and its photograph still found. Only the weather line is missing.
 * Without this the caller saw one undifferentiated "no climate" and dropped the
 * destination entirely, which turned a spent weather allowance into a shortlist
 * with nothing on it.
 */
export type ClimateBatch = {
  readonly found: Map<string, ClimateNormals>;
  /** Resolved coordinates for names the archive had no climate for. */
  readonly located: Map<string, GeocodedPlace>;
  readonly unavailable: Set<string>;
};

export type WeatherProvider = {
  readonly name: string;
  climateFor(query: PlaceQuery): Promise<ClimateNormals | null>;
  climateForMany(queries: readonly PlaceQuery[]): Promise<ClimateBatch>;
};

const openMeteoProvider: WeatherProvider = {
  name: 'open-meteo',
  climateFor,
  climateForMany,
};

/** The seam another climate source would be swapped in at. */
export function weatherProvider(): WeatherProvider {
  return openMeteoProvider;
}
