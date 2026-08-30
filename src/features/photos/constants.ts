import { MS_PER_DAY, MS_PER_MINUTE, MS_PER_SECOND } from '@/lib/time';

/**
 * Every tunable in the image pipeline, with the reasoning attached.
 *
 * Collected here rather than beside the code that reads them because they are a
 * single negotiated position with two rate limiters, and the numbers only make
 * sense against each other: the deadline has to sit inside the optimizer's abort,
 * the cool-off ceiling has to sit inside the deadline, and the retry ladder has to
 * fit in what is left. Changing one in isolation is how this breaks.
 */

/** Wikipedia's search and metadata endpoint. Needs no key or account. */
export const WIKIPEDIA_API_URL = 'https://en.wikipedia.org/w/api.php';

/** The one host the photo proxy is allowed to reach. */
export const COMMONS_PHOTO_HOST = 'upload.wikimedia.org';

/** Commons file paths all live under this prefix. */
export const COMMONS_PATH_PREFIX = '/wikipedia/';

/**
 * Wikimedia's User-Agent policy asks for a contact address. Add a real one
 * before running this anywhere public; anonymous generic agents are throttled
 * more aggressively. https://foundation.wikimedia.org/wiki/Policy:User-Agent_policy
 */
export const USER_AGENT = 'WayfareTravelAgent/0.1 (self-hosted travel planning demo)';

export const IMAGE_ACCEPT_HEADER = 'image/avif,image/webp,image/*,*/*;q=0.8';

/* -------------------------------------------------------------------------- */
/* Lookup: asking which photograph                                             */
/* -------------------------------------------------------------------------- */

/** Wide enough for the itinerary cover, which is the largest a photo is drawn. */
export const MAX_THUMB_WIDTH = 800;

/** Below this a thumbnail is too small to be worth the round trip. */
export const MIN_THUMB_WIDTH = 160;

/**
 * The lookup route's bounds, shared with its client.
 *
 * Enough for a batch of eight with room to spare, and a bound on the work. The
 * length cap is longer than any real place name; anything past it is not a
 * lookup, and callers truncate to it rather than being rejected.
 */
export const MAX_LOOKUP_QUERIES = 16;
export const MAX_LOOKUP_QUERY_LENGTH = 120;

/** Candidates per query: a top hit's lead image may be a map, or missing. */
export const SEARCH_CANDIDATES = 8;

/** Rank assigned to a hit the API returned without one, so it sorts last. */
export const UNRANKED = 99;

/** Files per batched licence call. The API's own ceiling for `titles`. */
export const MAX_LICENSE_TITLES = 50;

export const API_TIMEOUT_MS = 6 * MS_PER_SECOND;

/**
 * Wikipedia throttles anonymous callers hard: six near-simultaneous requests
 * is enough to start returning 429. One itinerary needs roughly a dozen
 * lookups, so calls are spaced out rather than fired in parallel.
 */
export const MIN_REQUEST_GAP_MS = 320;

export const API_RETRIES = 2;
export const API_BACKOFF_BASE_MS = 600;
export const API_BACKOFF_MAX_MS = 4 * MS_PER_SECOND;

export const LOOKUP_HIT_TTL_MS = MS_PER_DAY;

/** Short, so one transient API failure does not poison a place for long. */
export const LOOKUP_MISS_TTL_MS = 2 * MS_PER_MINUTE;

/** Longest credit line a card has room for before truncation stops helping. */
export const MAX_CREDIT_LENGTH = 60;

export const UNKNOWN_CREDIT = 'Wikimedia Commons';

/* -------------------------------------------------------------------------- */
/* Proxy: fetching the bytes                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Enough to clear a screenful inside the optimizer's seven seconds.
 *
 * One at a time is the safest thing to do to Commons and the worst thing to do
 * to a batch: eight photographs behind a single slot, with one 429 backing off
 * for a couple of seconds, puts the tail of the queue past the abort — which is
 * exactly the half-served set this is here to prevent. Three is inside what
 * Commons serves without complaint, and the retry loop covers the times it is
 * not.
 */
export const PHOTO_CONCURRENCY = 3;

/**
 * Generous, because these attempts are cheap and giving up is not.
 *
 * Nobody is waiting on this loop — it runs detached, and the request that
 * started it has long since answered — so the only thing patience costs is a
 * background task staying alive. Being impatient costs a photograph, and
 * Commons throttles in episodes long enough to swallow a short ladder whole.
 */
export const PHOTO_RETRIES = 6;

export const PHOTO_TIMEOUT_MS = 10 * MS_PER_SECOND;

/**
 * How long a caller waits before it is told to come back.
 *
 * Comfortably inside the optimizer's seven-second abort, because bowing out is
 * cheap and being cut off is not: we choose the status code, so the tile knows
 * the difference between "not yet" and "never" and can ask again.
 */
export const PHOTO_DEADLINE_MS = 5 * MS_PER_SECOND;

/**
 * Long enough to be a pause, short enough that a stale one costs little.
 *
 * Also the ceiling on any single back-off, because the wait is everyone's: an
 * unbounded doubling would let one unlucky photograph park the whole queue.
 */
export const PHOTO_COOLOFF_MAX_MS = 3 * MS_PER_SECOND;

export const PHOTO_BACKOFF_BASE_MS = 500;

/** Spread on each back-off so a screenful of tiles does not come back in step. */
export const PHOTO_BACKOFF_JITTER_MS = 250;

/**
 * Photographs held per process.
 *
 * These are thumbnails — tens of kilobytes each — so this is single-digit
 * megabytes at worst, in exchange for never asking Commons for the same file
 * twice. Deployments where the platform already caches this route are not
 * harmed by it; deployments where nothing does are the reason it exists.
 */
export const PHOTO_CACHE_MAX = 96;

export const DEFAULT_PHOTO_CONTENT_TYPE = 'image/jpeg';
