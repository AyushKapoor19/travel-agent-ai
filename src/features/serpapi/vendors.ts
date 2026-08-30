import 'server-only';

import { HttpStatus } from '@/lib/http';

import { SerpApiEngine, type SerpApiEngineName } from './constants';

/**
 * The two resellers of Google's travel surfaces this app can be pointed at.
 *
 * Both scrape the same four Google products and return recognisably the same
 * JSON, which is the only reason a switch is cheap: the schemas in `flights.ts`,
 * `hotels.ts` and `activities.ts` are written against Google's field names, not
 * against a vendor's. What differs is the envelope — where the engine goes, what
 * the query parameters are called, and which status code means the month is over
 * — and that is exactly what this file holds.
 *
 * The switch exists rather than a clean replacement because the free tiers are
 * not comparable and the right answer changes with the plan. SerpApi gives 250
 * searches a month free, which is the most generous free allowance of the two;
 * Scrapingdog charges five credits a call against 200 free, so forty. Above the
 * free line that inverts, and hard: Scrapingdog's $40 tier buys 40,000 travel
 * calls where SerpApi's $75 tier buys 5,000. Being able to move without a code
 * change is worth one indirection.
 */

export const Vendor = {
  SERPAPI: 'serpapi',
  SCRAPINGDOG: 'scrapingdog',
} as const;

export type VendorName = (typeof Vendor)[keyof typeof Vendor];

/**
 * What a response turned out to mean, once the status and the stated error have
 * been read together.
 *
 * Named as outcomes rather than as errors because two of them are not failures:
 * `EMPTY` is a real answer about an obscure destination, and the caller caches it.
 * The split between `QUOTA` and `TRANSIENT` is the one that matters most, since
 * only one of them is worth waiting for.
 */
export const Outcome = {
  OK: 'ok',
  EMPTY: 'empty',
  AUTH: 'auth',
  QUOTA: 'quota',
  TRANSIENT: 'transient',
  FATAL: 'fatal',
} as const;

export type OutcomeName = (typeof Outcome)[keyof typeof Outcome];

export type VendorSpec = {
  /** What this vendor is called in an error a developer will read. */
  readonly label: string;
  /** The environment variable its key lives in. */
  readonly keyEnv: string;
  /** Where to get a key, quoted in the error raised when there isn't one. */
  readonly signupUrl: string;
  /**
   * Engines this vendor answers well enough to be trusted with.
   *
   * Not every vendor covers every surface, and the failure when one does not is
   * silent — a schema that does not match returns an empty list rather than
   * raising, so the symptom is a destination with no attractions and no error
   * anywhere. Stating coverage means an uncovered engine is a loud configuration
   * error instead.
   */
  readonly engines: readonly SerpApiEngineName[];
  requestUrl(
    engine: SerpApiEngineName,
    params: Readonly<Record<string, string>>,
    key: string,
  ): string;
  classify(status: number, stated: string | null): OutcomeName;
  /**
   * Reshapes a response into the field names the schemas expect.
   *
   * The schemas in `flights.ts` and `hotels.ts` are written against Google's own
   * field names as SerpApi reports them, and that is the contract this restores.
   * Kept here rather than in the schemas so that adding a third vendor never
   * touches a file that knows about hotels.
   */
  normalize(engine: SerpApiEngineName, body: unknown): unknown;
};

/** Narrows an unknown to an indexable object without reaching for `any`. */
function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function matches(haystack: string, markers: readonly string[]): boolean {
  const text = haystack.toLowerCase();
  return markers.some((marker) => text.includes(marker));
}

/* -------------------------------------------------------------------------- */
/* SerpApi                                                                     */
/* -------------------------------------------------------------------------- */

const SERPAPI_SEARCH_URL = 'https://serpapi.com/search.json';

/** Phrases SerpApi uses when the allowance is actually gone, as opposed to paused. */
const SERPAPI_QUOTA_MARKERS = ['run out of searches', 'exceeded your', 'plan searches left'];

const SERPAPI_AUTH_MARKERS = ['invalid api key', 'missing api key'];

/**
 * Phrases meaning "Google had nothing", which is an answer and not a failure — a
 * real condition for an obscure destination, and one that must not be retried.
 */
const SERPAPI_EMPTY_MARKERS = ["hasn't returned any results", 'no results found'];

const serpApi: VendorSpec = {
  label: 'SerpApi',
  keyEnv: 'SERPAPI_KEY',
  signupUrl: 'https://serpapi.com/users/sign_up',

  // All four, and the shape the rest of the app is written against.
  engines: [SerpApiEngine.GOOGLE, SerpApiEngine.LOCAL, SerpApiEngine.HOTELS, SerpApiEngine.FLIGHTS],

  normalize: (_engine, body) => body,

  requestUrl(engine, params, key) {
    const query = new URLSearchParams({
      engine,
      ...params,
      // `no_cache` is deliberately absent: an identical query inside SerpApi's own
      // hour-long window is served free and does not count against the plan, which
      // is the difference between a demo that survives development and one that
      // spends its month on repeated probes.
      api_key: key,
    });

    return `${SERPAPI_SEARCH_URL}?${query.toString()}`;
  },

  classify(status, stated) {
    if (stated) {
      if (matches(stated, SERPAPI_EMPTY_MARKERS)) return Outcome.EMPTY;
      if (matches(stated, SERPAPI_AUTH_MARKERS)) return Outcome.AUTH;
      if (matches(stated, SERPAPI_QUOTA_MARKERS)) return Outcome.QUOTA;
    }

    if (status < HttpStatus.BAD_REQUEST) return Outcome.OK;
    if (status === HttpStatus.UNAUTHORIZED) return Outcome.AUTH;

    /*
     * A bare 429 is read as a throttle, not as a spent month, which reverses what
     * this code used to assume.
     *
     * Every SerpApi plan caps throughput at a fifth of its monthly volume per hour
     * — 50/hour on the free tier, 1,000/hour on Developer — and that ceiling
     * returns the same untexted 429 an exhausted allowance does. The two mistakes
     * are not symmetrical. Retrying a spent allowance costs seconds and no
     * searches, because SerpApi does not bill failed requests; refusing to retry a
     * throttle kills a turn that would have succeeded. So the recoverable reading
     * is the safe one, and a genuinely spent month still surfaces through the
     * stated markers above or as a transient failure once the retries run out.
     */
    if (status === HttpStatus.TOO_MANY_REQUESTS) return Outcome.TRANSIENT;
    if (status >= HttpStatus.INTERNAL_ERROR) return Outcome.TRANSIENT;

    return Outcome.FATAL;
  },
};

/* -------------------------------------------------------------------------- */
/* Scrapingdog                                                                 */
/* -------------------------------------------------------------------------- */

const SCRAPINGDOG_BASE_URL = 'https://api.scrapingdog.com';

/**
 * Scrapingdog's names for the three parameters it does not share with SerpApi.
 *
 * Everything else — dates, `adults`, `currency`, `departure_id`, `hotel_class`,
 * and the `type` encoding where 2 means one way — is spelled identically, which
 * is why this is a rename map and not a translation layer.
 */
const SCRAPINGDOG_PARAM_NAMES: Readonly<Record<string, string>> = {
  q: 'query',
  hl: 'language',
  gl: 'country',
};

/**
 * Google's own ceiling for a star rating, and the tell that distinguishes one
 * from a review count.
 */
const MAX_STAR_RATING = 5;

/**
 * Undoes Scrapingdog's transposition of a property's rating and its review count.
 *
 * Verified against a live Bali response, where the St. Regis came back as
 * `overall_rating: 2803, reviews: 4.8`. Both are the wrong way round: 4.8 is the
 * rating and 2803 is the count. Passed through untouched, every hotel card would
 * have advertised a 2,803-star hotel with 4.8 reviews.
 *
 * Written as a test on the values rather than an unconditional swap so that it
 * corrects itself. A rating cannot exceed five and a review count almost never
 * sits below it, so the exchange happens only when the pair is unambiguously
 * inverted — and the day Scrapingdog fixes their parser, this quietly stops
 * firing instead of reintroducing the bug from the other side.
 */
function untranspose(property: Record<string, unknown>): void {
  const rating = property.overall_rating;
  const reviews = property.reviews;

  if (typeof rating !== 'number' || typeof reviews !== 'number') return;
  if (rating <= MAX_STAR_RATING || reviews > MAX_STAR_RATING) return;

  property.overall_rating = reviews;
  property.reviews = rating;
}

/**
 * Undoes one round of JSON escaping that Scrapingdog applies and does not remove.
 *
 * "Desa Swan Villas \u0026 SPA" arrives with those six characters literally in the
 * string rather than as an ampersand, so the escape sequence renders on the card.
 * Only the numeric form is handled, because that is the only one observed and
 * because interpreting backslashes more broadly would start mangling names that
 * legitimately contain one.
 */
function unescapeJson(text: string): string {
  return text.replace(/\\u([0-9a-fA-F]{4})/g, (_match, code: string) =>
    String.fromCharCode(Number.parseInt(code, 16)),
  );
}

/**
 * Scrapingdog names a property `title`; SerpApi and the schemas call it `name`.
 * Universal across every property in the sample, and fatal on its own — `name` is
 * the one required field, so without this the whole list fails to parse and the
 * destination silently has no hotels.
 */
function normalizeHotels(body: unknown): unknown {
  const root = asRecord(body);
  if (!root) return body;

  const properties = asArray(root.properties).map((entry) => {
    const property = asRecord(entry);
    if (!property) return entry;

    const mapped: Record<string, unknown> = { ...property };

    const title = mapped.name ?? mapped.title;
    if (typeof title === 'string') mapped.name = unescapeJson(title);
    if (typeof mapped.description === 'string') {
      mapped.description = unescapeJson(mapped.description);
    }

    untranspose(mapped);
    return mapped;
  });

  return { ...root, properties };
}

/**
 * Scrapingdog writes the trip type as "One Way" where Google and SerpApi write
 * "One way".
 *
 * A single capital letter, and it inverts the flag: `flights.ts` decides
 * `roundTrip` by comparing against the lowercase spelling, so the fares would be
 * presented as returns — the sort of wrongness a traveller only finds at the
 * airport.
 *
 * And they are not returns. Scrapingdog ignores both `return_date` and `type`:
 * a round-trip request and a one-way request for the same route came back
 * byte-identical, down to the price insights. So the type it reports is the truth
 * about what it searched, the correction above lets that truth through, and every
 * fare from this vendor is one-way — which the flight and cost cards will say,
 * because they read this flag. What they cannot do is show a return fare that the
 * vendor never priced.
 */
function normalizeFlights(body: unknown): unknown {
  const root = asRecord(body);
  if (!root) return body;

  const retype = (entries: unknown): unknown[] =>
    asArray(entries).map((entry) => {
      const itinerary = asRecord(entry);
      if (!itinerary || typeof itinerary.type !== 'string') return entry;

      return itinerary.type.toLowerCase() === 'one way'
        ? { ...itinerary, type: 'One way' }
        : itinerary;
    });

  return {
    ...root,
    best_flights: retype(root.best_flights),
    other_flights: retype(root.other_flights),
  };
}

const scrapingdog: VendorSpec = {
  label: 'Scrapingdog',
  keyEnv: 'SCRAPINGDOG_KEY',
  signupUrl: 'https://api.scrapingdog.com/register',

  /*
   * Stays and fares only, which is the finding that shaped this entry.
   *
   * Their Google Hotels and Google Flights endpoints return Google's data in
   * Google's shape, give or take the two fixups above. The two engines behind
   * "things to do" do not survive the move: the plain search endpoint carries no
   * `top_sights` block at all, which is the sole source of entry prices, and the
   * local pack came back with three results for "things to do in Bali" — against
   * SerpApi's twenty — carrying no rating, no type and no description, which is
   * every field the activity card and its ranking are built on.
   */
  engines: [SerpApiEngine.HOTELS, SerpApiEngine.FLIGHTS],

  normalize(engine, body) {
    if (engine === SerpApiEngine.HOTELS) return normalizeHotels(body);
    if (engine === SerpApiEngine.FLIGHTS) return normalizeFlights(body);
    return body;
  },

  requestUrl(engine, params, key) {
    const renamed = Object.fromEntries(
      Object.entries(params).map(([name, value]) => [SCRAPINGDOG_PARAM_NAMES[name] ?? name, value]),
    );

    const query = new URLSearchParams({ ...renamed, api_key: key });

    // The engine is a path segment here rather than a parameter, and the segment
    // names match SerpApi's engine names exactly, so `SerpApiEngine` needs no
    // per-vendor translation of its own.
    return `${SCRAPINGDOG_BASE_URL}/${engine}?${query.toString()}`;
  },

  classify(status, _stated) {
    if (status < HttpStatus.BAD_REQUEST) return Outcome.OK;

    // Documented as billable alongside 200, which is the tell that it means "the
    // scrape worked and found nothing" rather than "the endpoint is wrong".
    if (status === HttpStatus.NOT_FOUND) return Outcome.EMPTY;

    if (status === HttpStatus.UNAUTHORIZED) return Outcome.AUTH;

    // Scrapingdog separates the two cases the SerpApi transport has to guess at:
    // 403 is the monthly credit limit, 429 is only ever the concurrency cap.
    if (status === HttpStatus.FORBIDDEN) return Outcome.QUOTA;
    if (status === HttpStatus.TOO_MANY_REQUESTS) return Outcome.TRANSIENT;

    // Returned when its own internal retries gave up inside sixty seconds.
    // Explicitly not billed, so trying again is free.
    if (status === HttpStatus.GONE) return Outcome.TRANSIENT;

    if (status >= HttpStatus.INTERNAL_ERROR) return Outcome.TRANSIENT;

    return Outcome.FATAL;
  },
};

/* -------------------------------------------------------------------------- */
/* Selection                                                                   */
/* -------------------------------------------------------------------------- */

const SPECS: Readonly<Record<VendorName, VendorSpec>> = {
  [Vendor.SERPAPI]: serpApi,
  [Vendor.SCRAPINGDOG]: scrapingdog,
};

/**
 * Which vendor is answering, read at call time.
 *
 * Defaults to SerpApi because that is the key an existing checkout already has,
 * so this switch changes nothing until someone asks it to. An unrecognised value
 * falls back rather than throwing: a typo in an environment variable should not
 * take the travel tools down when there is a working default sitting there.
 */
export function activeVendor(): VendorSpec {
  const stated = process.env.SERP_VENDOR?.trim().toLowerCase();
  return SPECS[stated as VendorName] ?? SPECS[Vendor.SERPAPI];
}

function hasKey(vendor: VendorSpec): boolean {
  return Boolean(process.env[vendor.keyEnv]?.trim());
}

/**
 * The vendor that will answer for one engine, which is not always the chosen one.
 *
 * Selection is per engine rather than global because coverage is uneven: pointing
 * the app at Scrapingdog is the right call for stays and fares and would silently
 * empty every activity list, since it serves neither the top-sights block nor a
 * usable local pack. Rather than make that an all-or-nothing choice, an engine the
 * chosen vendor does not cover falls through to one that does and has a key.
 *
 * The fallback is deliberately conditional on a key being present. Reaching for a
 * vendor nobody configured would trade a clear "no attractions" for a confusing
 * authentication failure, and the first is the honest report of what happened.
 */
export function vendorFor(engine: SerpApiEngineName): VendorSpec {
  const chosen = activeVendor();
  if (chosen.engines.includes(engine)) return chosen;

  const fallback = Object.values(SPECS).find(
    (candidate) => candidate.engines.includes(engine) && hasKey(candidate),
  );

  return fallback ?? chosen;
}
