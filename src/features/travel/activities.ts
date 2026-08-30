import 'server-only';

import { z } from 'zod';

import { imageProvider } from '@/features/photos/server';
import { cacheKey, createTtlCache } from '@/features/serpapi/cache';
import { serpApiSearch } from '@/features/serpapi/client';
import { SerpApiEngine } from '@/features/serpapi/constants';
import { numericField } from '@/features/serpapi/schema';
import { nameKey } from '@/lib/name-key';

import { activitySearchUrl, BookingProvider } from './booking-links';
import type { ActivityProvider, ActivityQuery, ActivityResult } from './types';

/**
 * Things to do, from Google's own local and top-sights results.
 *
 * Two engines, because neither is complete alone and the missing half of each is
 * the half a traveller asks about. `google_local` knows what a place *is* — a
 * category and a one-line description, which the top-sights block does not carry
 * at all: it returns "Open" as the description for seventeen of twenty Bali
 * sights. The top-sights block knows what a place *costs*, which `google_local`
 * omits for attractions entirely.
 *
 * So the local result is the record and the sight supplies its entry price. What
 * neither returns — how long a visit takes, whether a ticket is refundable — is
 * absent from the model rather than estimated, because a plausible duration is
 * indistinguishable from a measured one on a card and the traveller cannot tell
 * which they were given.
 */

const DEFAULT_LIMIT = 4;

/** Free entry, stated as a price so the card can say so rather than say nothing. */
const FREE_PRICE = 0;

/**
 * SerpApi reports prices in the currency implied by `gl`, and `gl=us` is what the
 * rest of these calls request, so a figure is dollars unless Google says otherwise.
 */
const PRICE_CURRENCY = 'USD';

/**
 * Enough results that filtering junk and ranking still leaves a full set. Google
 * returns twenty for either engine, and asking for fewer is not cheaper.
 */
const CANDIDATE_CEILING = 20;

const localResultSchema = z.object({
  title: z.string(),
  type: z.string().optional(),
  description: z.string().optional(),
  rating: numericField,
  reviews: numericField,
  address: z.string().optional(),
});

/**
 * `local_results` is an array for `google_local` but an object with `places` for a
 * plain web search, and both shapes reach this code as the engines are mixed.
 */
const localResponseSchema = z.object({
  local_results: z
    .union([z.array(localResultSchema), z.object({ places: z.array(localResultSchema) })])
    .optional(),
});

const sightSchema = z.object({
  title: z.string(),
  /** Verbatim, e.g. "$7.32" or "Free". Absent when Google lists no ticket price. */
  price: z.string().optional(),
  extracted_price: numericField,
  rating: numericField,
  reviews: numericField,
  description: z.string().optional(),
});

const topSightsResponseSchema = z.object({
  top_sights: z.object({ sights: z.array(sightSchema) }).optional(),
});

/**
 * Things Google puts in the description field that are not descriptions.
 *
 * The field is overloaded on both engines, and the two kinds of rubbish it
 * carries are worth naming separately because they look nothing alike. The
 * top-sights block puts opening hours there — "Open" was the description for
 * seventeen of twenty Bali sights. The local engine puts service attributes
 * there, dot-separated: "Dine-in·Takeout·Delivery", or a bare "Onsite services".
 *
 * Both are dropped rather than shown. A card reading "Dine-in·Takeout" tells a
 * traveller nothing about whether to go, and the real descriptions underneath —
 * "Island temple with water views", "Hillside rice paddies & jungle zip lines" —
 * are good enough that keeping the noise out is worth a filter.
 */
const DESCRIPTION_REJECTIONS = [
  /** Opening hours, e.g. "Open", "Open ⋅ Closes 5 pm", "Temporarily closed". */
  /^(open|closed|closes|opens|temporarily closed|permanently closed)\b/i,
  /**
   * An attribute list. The dot operators are the tell: Google joins attributes
   * with them, and prose descriptions never contain one.
   */
  /[·⋅]/,
  /** A single attribute, which has no separator to give it away. */
  /^(onsite services|in-store shopping|curbside pickup|dine-in|takeout|delivery|no delivery)$/i,
];

function usableDescription(text: string | undefined): string | null {
  const trimmed = text?.trim();
  if (!trimmed) return null;

  return DESCRIPTION_REJECTIONS.some((pattern) => pattern.test(trimmed)) ? null : trimmed;
}

/**
 * Joins the two engines on title. Google writes the same place slightly
 * differently across surfaces, and a strict equality join silently drops the
 * price off half the set.
 */
const joinKey = nameKey;

/** Takes a partial so a local result with no matching sight resolves to no price. */
function priceFrom(sight: { price?: string | undefined; extracted_price?: number | undefined }): {
  price: number | null;
  label: string | null;
} {
  const label = sight.price?.trim() ?? null;
  if (label === null) return { price: null, label: null };

  // "Free" carries no `extracted_price`, and is a real, useful figure.
  if (/^free$/i.test(label)) return { price: FREE_PRICE, label };

  return { price: sight.extracted_price ?? null, label };
}

/**
 * Results that are not activities.
 *
 * A search for a region returns the region itself as an unrated entry — "Bali"
 * comes back first for Bali — and anything with no rating has nothing to rank or
 * show on a card either.
 */
function isUsable(
  result: { title: string; rating?: number | undefined },
  destination: string,
): boolean {
  if (result.rating === undefined) return false;
  return joinKey(result.title) !== joinKey(destination);
}

/**
 * The query Google is actually asked.
 *
 * A stated interest is put into the search rather than used to filter what comes
 * back, because Google's own ranking for "best food in Lisbon" is better than
 * anything a category match over "Tourist attraction" could recover — the local
 * engine's `type` is too coarse to sort an interest by.
 *
 * The country is appended when known, and it is not decoration: the local pack's
 * size tracks how specific the query is. "Things to do in Bali" returned four
 * results, one of which was the island itself; adding "Indonesia" to the same
 * search returned twenty. It also disambiguates, for the same reason the geocoder
 * takes a country hint.
 */
function searchQuery(
  destination: string,
  country: string | undefined,
  category: string | undefined,
): string {
  const place = country ? `${destination} ${country}` : destination;
  return category ? `best ${category} in ${place}` : `things to do in ${place}`;
}

/**
 * Drafts rather than finished results, because the search is metered by SerpApi
 * and worth remembering while the photographs are decoration a caller may not
 * want. The destination shortlist reads this for sight names alone, and enriching
 * what it asked for cost forty Wikipedia lookups nobody would ever see — enough to
 * be rate-limited out of the three that mattered.
 */
const activitiesCache = createTtlCache<Draft[]>();

async function fetchLocal(
  destination: string,
  country: string | undefined,
  category: string | undefined,
): Promise<z.infer<typeof localResultSchema>[]> {
  const body = await serpApiSearch(SerpApiEngine.LOCAL, {
    q: searchQuery(destination, country, category),
    hl: 'en',
    gl: 'us',
  });

  const parsed = localResponseSchema.safeParse(body);
  if (!parsed.success) return [];

  const results = parsed.data.local_results;
  if (!results) return [];

  return Array.isArray(results) ? results : results.places;
}

/**
 * The top-sights block for a destination, cached independently of the category.
 *
 * Cached separately for a reason that only showed up end to end. The block is the
 * sole source of entry prices, and it was originally fetched only for an
 * untargeted search — on the theory that "top sights" says nothing about the
 * restaurants a food query asked for. But the model almost always passes a
 * category, because it has the traveller's interests in hand, so in practice the
 * prices were never fetched at all: a planned week in Bali came back with
 * Uluwatu Temple priced at nothing, when Google lists $7.39.
 *
 * The query does not depend on the category, so one fetch serves every search for
 * that destination and a conversation exploring three interests still spends one
 * search on prices rather than three.
 */
const sightsCache = createTtlCache<z.infer<typeof sightSchema>[]>();

async function fetchSights(
  destination: string,
  country: string | undefined,
): Promise<Map<string, z.infer<typeof sightSchema>>> {
  const key = cacheKey('sights', destination, country);
  const cached = sightsCache.read(key);

  if (cached) return indexByTitle(cached.value ?? []);

  const place = country ? `${destination} ${country}` : destination;

  const body = await serpApiSearch(SerpApiEngine.GOOGLE, {
    q: `top sights in ${place}`,
    hl: 'en',
    gl: 'us',
  });

  const parsed = topSightsResponseSchema.safeParse(body);
  const sights = (parsed.success ? parsed.data.top_sights?.sights : undefined) ?? [];

  sightsCache.write(key, sights.length > 0 ? sights : null);

  return indexByTitle(sights);
}

function indexByTitle(
  sights: readonly z.infer<typeof sightSchema>[],
): Map<string, z.infer<typeof sightSchema>> {
  return new Map(sights.map((sight) => [joinKey(sight.title), sight]));
}

const serpApiActivityProvider: ActivityProvider = {
  name: 'Google via SerpApi',

  async searchActivities(query: ActivityQuery): Promise<ActivityResult[]> {
    const destination = query.destination.trim();
    if (!destination) return [];

    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, CANDIDATE_CEILING);
    const key = cacheKey('activities', destination, query.country, query.category, limit);

    const cached = activitiesCache.read(key);

    // A transient failure is deliberately not cached: it would leave a
    // destination with nothing to do for the rest of the hour.
    const drafts = cached
      ? (cached.value ?? [])
      : await buildActivities(destination, query.country, query.category, limit);

    if (!cached) activitiesCache.write(key, drafts.length > 0 ? drafts : null);
    if (drafts.length === 0) return [];

    return query.withImages === false
      ? drafts.map((draft) => toResult(draft, destination, null))
      : withImages(drafts, destination);
  },
};

/** Batched into one round trip: the image provider paces its outbound calls. */
async function withImages(
  drafts: readonly Draft[],
  destination: string,
): Promise<ActivityResult[]> {
  const images = await imageProvider().lookup(
    drafts.map((draft) => imageQuery(draft.name, destination)),
  );

  return drafts.map((draft) =>
    toResult(draft, destination, images.get(imageQuery(draft.name, destination)) ?? null),
  );
}

/** One activity as the two engines jointly describe it, before a photo is attached. */
type Draft = {
  name: string;
  category: string | null;
  description: string | null;
  rating: number;
  reviewCount: number;
  price: number | null;
  priceLabel: string | null;
};

/**
 * The two engines merged into one ordered set.
 *
 * The local result is preferred wherever both know a place, because it is the
 * richer record — the sight contributes its entry price and nothing else. Where
 * only the sight knows a place, it becomes an entry in its own right with a null
 * category and description.
 *
 * That top-up is not a nicety. The local pack's length is unpredictable: "things
 * to do in Bali" returned four rows where the top-sights block returned twenty,
 * so without it a request for four activities was answered with three. The block
 * is already fetched for the price, so filling the gap from it costs no quota.
 */
function mergeDrafts(
  local: readonly z.infer<typeof localResultSchema>[],
  sights: ReadonlyMap<string, z.infer<typeof sightSchema>>,
  destination: string,
  topUp: boolean,
): Draft[] {
  const drafts = new Map<string, Draft>();

  for (const result of local) {
    if (!isUsable(result, destination)) continue;

    const quoted = priceFrom(sights.get(joinKey(result.title)) ?? {});

    drafts.set(joinKey(result.title), {
      name: result.title,
      category: result.type?.trim() ?? null,
      description: usableDescription(result.description),
      rating: result.rating ?? 0,
      reviewCount: result.reviews ?? 0,
      price: quoted.price,
      priceLabel: quoted.label,
    });
  }

  // Landmarks are only added as entries of their own for an untargeted search. A
  // traveller who asked about food should not be handed a temple because the
  // block that priced their restaurants happened to mention one.
  if (!topUp) return [...drafts.values()];

  for (const [key, sight] of sights) {
    if (drafts.has(key) || !isUsable(sight, destination)) continue;

    const quoted = priceFrom(sight);

    drafts.set(key, {
      name: sight.title,
      // The block carries neither, and its description field holds opening hours.
      category: null,
      description: usableDescription(sight.description),
      rating: sight.rating ?? 0,
      reviewCount: sight.reviews ?? 0,
      price: quoted.price,
      priceLabel: quoted.label,
    });
  }

  return [...drafts.values()];
}

async function buildActivities(
  destination: string,
  country: string | undefined,
  category: string | undefined,
  limit: number,
): Promise<Draft[]> {
  // The two reads are independent, so they overlap. Sights are always fetched —
  // they are the only source of an entry price — but only fill out the list when
  // nothing specific was asked for.
  const [local, sights] = await Promise.all([
    fetchLocal(destination, country, category),
    fetchSights(destination, country),
  ]);

  return mergeDrafts(local, sights, destination, category === undefined).slice(0, limit);
}

function toResult(
  draft: Draft,
  destination: string,
  image: ActivityResult['image'],
): ActivityResult {
  return {
    id: `activity-${joinKey(draft.name)}`,
    name: draft.name,
    category: draft.category,
    price: draft.price,
    priceLabel: draft.priceLabel,
    currency: PRICE_CURRENCY,
    rating: draft.rating,
    reviewCount: draft.reviewCount,
    description: draft.description,
    bookingUrl: activitySearchUrl(draft.name, destination),
    provider: BookingProvider.ACTIVITIES,
    image,
  };
}

/** Scoped to the destination, so "Central Market" is not looked up in the wrong city. */
function imageQuery(name: string, destination: string): string {
  return `${name} ${destination}`;
}

/**
 * The provider in use. The single seam a different source is swapped in at, and
 * the reason nothing above this file knows which one answered.
 */
export function activityProvider(): ActivityProvider {
  return serpApiActivityProvider;
}
