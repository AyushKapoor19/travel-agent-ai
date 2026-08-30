import 'server-only';

import { imageProvider } from '@/features/photos/server';
import { weatherProvider } from '@/features/weather/server';
import type { ClimateNormals, GeocodedPlace, MonthlyNormal } from '@/features/weather/shared';
import {
  bestMonthIndexes,
  climateScore,
  provenanceLabel,
  rainWord,
  temperatureWord,
} from '@/features/weather/shared';
import { shortCountryName } from '@/lib/countries';
import { formatPrice } from '@/lib/format';
import { monthName, monthsAdjacent } from '@/lib/months';
import { nameKey } from '@/lib/name-key';
import { nightsBetween } from '@/lib/time';

import { activityProvider } from './activities';
import { hotelProvider } from './hotels';
import type {
  BudgetLevel,
  DestinationCandidate,
  DestinationProvider,
  DestinationQuery,
  DestinationReason,
  DestinationShortlist,
  DestinationSuggestion,
  HotelResult,
  RejectedCandidate,
} from './types';

/**
 * Choosing where to send someone: the model proposes, this layer verifies.
 *
 * The division of labour is the whole design. Knowing that Split is a good answer
 * to "somewhere warm on a coast in September" is world knowledge, and a language
 * model has more of it than any list we could write — the sixteen hand-typed
 * cities this replaced could not answer for Croatia, Colombia or Georgia at all,
 * because the set of places the app could ever suggest was a file. Knowing what
 * September in Split is actually like is a measurement, and a model has no
 * business supplying it: every temperature here comes from the archive and every
 * rate from what Google is quoting for the traveller's dates.
 *
 * So nothing a candidate arrives with is trusted except the idea of it. The city
 * is geocoded, its climate is fetched, its rooms are priced, its sights are looked
 * up, and anything that fails to resolve is dropped rather than described.
 *
 * The ranking stays ordinary arithmetic rather than another model call, for the
 * reasons it always was: the same question gives the same order, every candidate
 * can say what it won on, and the scoring is testable without a network.
 */

/** Two or three, per the prompt. More is a menu, not a recommendation. */
const DEFAULT_LIMIT = 3;

/**
 * How many proposals get verified, however many arrive.
 *
 * The ceiling exists because verification costs real quota — a search per
 * candidate for rates, another per finalist for sights — and a model asked for
 * suggestions will happily offer twelve. Five is enough breadth for three
 * survivors after the climate filter has taken its share.
 */
const MAX_CANDIDATES = 5;

/** Sights per destination. Three is a flavour of the place, not an itinerary. */
const HIGHLIGHTS_WANTED = 3;

/**
 * How much each dimension counts. Only the ones we can actually judge apply, so a
 * request naming only the weather is ranked on the weather rather than being
 * flattened by three unknowns.
 */
const WEIGHT = {
  climate: 1,
  season: 0.5,
  budget: 0.5,
  /** Headroom under a stated ceiling — only scored when there is one. */
  value: 0.6,
} as const;

/**
 * Nightly rates a budget traveller is steered towards and a luxury one away from.
 *
 * Read against the cheapest real quote in the city for the class of property the
 * traveller asked for, which makes it a rough read on how expensive the place is
 * rather than a judgement about any one hotel.
 */
const CHEAP_NIGHT_USD = 90;
const DEAR_NIGHT_USD = 260;

/** Credit for a month that merely borders a good one, rather than nothing. */
const SHOULDER_SEASON_SCORE = 0.5;

/** A luxury traveller in a genuinely cheap city has not been badly served. */
const LUXURY_FLOOR_SCORE = 0.7;

/**
 * A proposal that survived being looked up.
 *
 * `place` is the bar for surviving, and it is deliberately lower than it was.
 * Resolving the name is what the rest of the pipeline needs — coordinates are
 * what price a room, find a sight and fetch a photograph — and it is a separate
 * request from the climate, metered separately and failing separately.
 *
 * So `normals` is nullable, which is the whole of the fix for a shortlist that
 * came back empty. It used to be required, meaning a place whose weather could
 * not be measured was discarded along with everything about it that could: one
 * exhausted Open-Meteo allowance took out destination recommendations entirely
 * and reported five perfectly good cities as unverifiable. A missing climate now
 * costs the weather line and the two dimensions ranked on it, and nothing else.
 *
 * `month` is null when the traveller has not said when they are going, or when
 * there are no normals to read it from.
 */
type Verified = {
  candidate: DestinationCandidate;
  place: GeocodedPlace;
  /** Null when the archive could not answer for it. The rest still stands. */
  normals: ClimateNormals | null;
  month: MonthlyNormal | null;
  /** Derived from this place's own measurements, bent to the stated preference. */
  bestMonths: readonly number[];
};

/** A proposal the archive did answer for, so its weather can be spoken about. */
type Measured = Verified & { normals: ClimateNormals };

function isMeasured(verified: Verified): verified is Measured {
  return verified.normals !== null;
}

type Priced = Verified & {
  cost: DestinationSuggestion['cost'];
  score: number;
};

/**
 * The name every lookup after geocoding is made with.
 *
 * Deliberately the geocoder's name and not the model's, and the difference is not
 * cosmetic. A model proposing Sicily writes "Siracusa"; the geocoder, asked for
 * English, answers "Syracuse". Google Hotels returns that city's properties for
 * both spellings but quotes rates for only the English one, so the Italian name
 * produced a card with no price. English Wikipedia has no "Siracusa" article at
 * all, so a search for it skipped past "Syracuse, Sicily" — which shares no word
 * with the query and fails the relevance check — and settled on "Siracusa lemon",
 * putting a photograph of citrus fruit on a destination card.
 *
 * One resolved name upstream fixes both, and the model's spelling stays where it
 * belongs: on the card, matching the prose the model writes around it.
 */
function resolvedPlace({ place }: Verified): { city: string; country: string } {
  return { city: place.name, country: shortCountryName(place.country) };
}

/** How hotel and photo lookups want it: one string, city then country. */
function placeQuery(verified: Verified): string {
  const { city, country } = resolvedPlace(verified);
  return country ? `${city}, ${country}` : city;
}

/**
 * The high the traveller would actually meet.
 *
 * When they have named a month, that month. When they have not, the average across
 * the place's own best months — which is the honest answer to "how warm is it
 * there", because it is how warm it is when you would go.
 */
function representativeHighC({ month, normals, bestMonths }: Measured): number {
  if (month) return month.avgHighC;

  const months = bestMonths.length > 0 ? bestMonths : normals.months.map((m) => m.monthIndex);
  const total = months.reduce((sum, index) => sum + (normals.months[index]?.avgHighC ?? 0), 0);
  return total / months.length;
}

/**
 * Whether this is a good month to be there — full marks in a best month, half just
 * outside one, so a shoulder week is not written off.
 */
function seasonScore({ bestMonths }: Measured, monthIndex: number): number {
  if (bestMonths.includes(monthIndex)) return 1;

  const adjacent = bestMonths.some((month) => monthsAdjacent(month, monthIndex));
  return adjacent ? SHOULDER_SEASON_SCORE : 0;
}

/** Steers a budget traveller cheap and a luxury one expensive, gently. */
function budgetScore(nightlyUsd: number, budgetLevel: BudgetLevel): number {
  if (budgetLevel === 'budget') {
    return nightlyUsd <= CHEAP_NIGHT_USD
      ? 1
      : Math.max(0, 1 - (nightlyUsd - CHEAP_NIGHT_USD) / DEAR_NIGHT_USD);
  }

  if (budgetLevel === 'luxury') {
    return nightlyUsd >= CHEAP_NIGHT_USD ? 1 : LUXURY_FLOOR_SCORE;
  }

  const middle = (CHEAP_NIGHT_USD + DEAR_NIGHT_USD) / 2;
  return Math.max(0, 1 - Math.abs(nightlyUsd - middle) / DEAR_NIGHT_USD);
}

/**
 * What a stay there costs, from one property's real quote.
 *
 * The cheapest property's own nightly rate and its own total, rather than the
 * lowest of each taken separately: those can come from different hotels, and a
 * "from $86 a night, $610 the week" that no single booking could produce is a
 * fabrication assembled out of true parts.
 */
function costFrom(hotels: readonly HotelResult[], nights: number | null) {
  const quoted = hotels
    .filter((hotel) => hotel.pricePerNight !== null && hotel.pricePerNight > 0)
    .sort((a, b) => (a.pricePerNight ?? 0) - (b.pricePerNight ?? 0));

  const cheapest = quoted[0];
  if (!cheapest?.pricePerNight) return null;

  const nightly = cheapest.pricePerNight;

  return {
    nightlyFromUsd: nightly,
    stayTotalUsd: cheapest.totalPrice ?? (nights ? Math.round(nightly * nights) : null),
    nights,
    currency: cheapest.currency,
    sampledProperties: quoted.length,
  };
}

/**
 * The grounds this place was chosen on — every line derived from something a
 * provider returned. The model's own rationale is deliberately absent: it travels
 * in `summary`, where it cannot be mistaken for evidence.
 */
function reasonsFor(
  verified: Verified,
  cost: DestinationSuggestion['cost'],
  query: DestinationQuery,
) {
  const reasons: DestinationReason[] = [];
  const { month, bestMonths } = verified;

  if (month) {
    reasons.push({
      kind: 'climate',
      text: `Highs around ${Math.round(month.avgHighC)}°C in ${monthName(month.monthIndex)}, ${rainWord(month.precipitationMm)}.`,
    });
  }

  if (query.monthIndex !== undefined && bestMonths.length > 0) {
    reasons.push(
      bestMonths.includes(query.monthIndex)
        ? {
            kind: 'season',
            text: `${monthName(query.monthIndex)} is one of its best months.`,
          }
        : {
            // Worth saying rather than hiding: a place that is right and mistimed is
            // useful information, and the traveller may move the trip.
            kind: 'season',
            text: `Usually better in ${bestMonths.map(monthName).join(', ')}.`,
          },
    );
  }

  if (cost) {
    const nightly = formatPrice(cost.nightlyFromUsd, cost.currency);
    const whole =
      cost.stayTotalUsd !== null && cost.nights !== null
        ? ` — about ${formatPrice(cost.stayTotalUsd, cost.currency)} for ${cost.nights} ${cost.nights === 1 ? 'night' : 'nights'}`
        : '';

    reasons.push({ kind: 'cost', text: `Stays from ${nightly} a night${whole}.` });

    if (query.maxTotalUsd !== undefined && cost.stayTotalUsd !== null) {
      const ceiling = formatPrice(query.maxTotalUsd, cost.currency);
      reasons.push({
        kind: 'cost',
        text:
          cost.stayTotalUsd <= query.maxTotalUsd
            ? `Lodging fits inside your ${ceiling}, leaving ${formatPrice(query.maxTotalUsd - cost.stayTotalUsd, cost.currency)} for everything else.`
            : `Lodging alone comes to more than your ${ceiling}.`,
      });
    }
  }

  return reasons;
}

function scoreOf(
  verified: Verified,
  cost: DestinationSuggestion['cost'],
  query: DestinationQuery,
): number {
  let total = 0;
  let applicable = 0;

  // Both weather dimensions need measurements, and an unmeasured candidate is
  // scored on what is left rather than on zeroes. Scoring it zero would rank it
  // below every measured city on the strength of our own outage; the tie-break in
  // `recommendDestinations` is what keeps it from outranking them instead.
  const measured = isMeasured(verified) ? verified : null;

  if (query.climate && measured) {
    total += climateScore(representativeHighC(measured), query.climate) * WEIGHT.climate;
    applicable += WEIGHT.climate;
  }

  if (query.monthIndex !== undefined && measured) {
    total += seasonScore(measured, query.monthIndex) * WEIGHT.season;
    applicable += WEIGHT.season;
  }

  if (query.budgetLevel && cost) {
    total += budgetScore(cost.nightlyFromUsd, query.budgetLevel) * WEIGHT.budget;
    applicable += WEIGHT.budget;
  }

  // A stated ceiling makes headroom worth something: two destinations both inside
  // a $2000 budget are not equally good answers when one leaves $1300 for the
  // flights that budget almost certainly has to cover and the other leaves $800.
  if (query.maxTotalUsd !== undefined && cost?.stayTotalUsd != null) {
    total += Math.max(0, 1 - cost.stayTotalUsd / query.maxTotalUsd) * WEIGHT.value;
    applicable += WEIGHT.value;
  }

  // Nothing stated to judge on. The model's own ordering is then the best signal
  // available, and returning zero for everything preserves it.
  return applicable > 0 ? total / applicable : 0;
}

function weatherFor({ month, normals }: Verified): DestinationSuggestion['weather'] {
  if (!month || !normals) return null;

  const rain = rainWord(month.precipitationMm);

  return {
    month: monthName(month.monthIndex),
    highC: month.avgHighC,
    lowC: month.avgLowC,
    rain,
    summary: `${temperatureWord(month.avgHighC)} and ${rain}`,
    source: provenanceLabel(normals),
  };
}

/**
 * Looks up every proposal, and keeps the ones that stand up.
 *
 * Only two things get a candidate dropped, and both are facts about the place. A
 * name the geocoder cannot find is one the model may have invented, and there is
 * nothing honest to say about it. A place whose measured weather contradicts what
 * was asked for is a wrong answer rather than a lower-ranked one: someone who asks
 * for cold and is offered a 28°C city has not been given a worse suggestion, and no
 * strength elsewhere should buy its way past that.
 *
 * A missing climate is explicitly not one of them any more, and that is the bug
 * this function was carrying. It required normals to build an entry, so a place
 * that geocoded perfectly well but whose weather the archive declined to serve was
 * discarded — and when the archive declines, it declines for every candidate at
 * once. The result was a shortlist of nothing, five cities reported as unverifiable
 * and a traveller told we could not check anywhere in Mexico, on an afternoon when
 * the hotel rates, the sights and the photographs were all answering normally.
 *
 * So an unmeasured candidate is kept, without its weather. `weather` on the
 * suggestion is nullable and the card has always drawn without it — that is the
 * state a shortlist with no travel dates has always been in — so nothing downstream
 * has to change, and no temperature is claimed that nobody measured.
 */
async function verifyAll(
  query: DestinationQuery,
): Promise<{ verified: Verified[]; rejected: RejectedCandidate[] }> {
  const candidates = query.candidates.slice(0, MAX_CANDIDATES);
  if (candidates.length === 0) return { verified: [], rejected: [] };

  const { found, located, unavailable } = await weatherProvider().climateForMany(
    candidates.map(({ city, country }) => ({ name: city, country })),
  );

  const verified: Verified[] = [];
  const rejected: RejectedCandidate[] = [];

  for (const candidate of candidates) {
    const normals = found.get(candidate.city) ?? null;
    // Either the climate lookup resolved it on the way to the archive, or the
    // geocoder resolved it and the archive then refused.
    const place = normals?.place ?? located.get(candidate.city) ?? null;

    if (!place) {
      rejected.push({
        city: candidate.city,
        // An outage is not evidence about the destination. Both used to be
        // `unmappable`, and on the afternoon the archive's daily quota ran out that
        // turned a working shortlist into a paragraph telling the traveller that
        // Rome, Athens and Dubrovnik could not be verified.
        reason: unavailable.has(candidate.city) ? 'unavailable' : 'unmappable',
      });
      continue;
    }

    const entry: Verified = {
      candidate,
      place,
      normals,
      month:
        normals && query.monthIndex !== undefined
          ? (normals.months[query.monthIndex] ?? null)
          : null,
      bestMonths: normals ? bestMonthIndexes(normals, query.climate) : [],
    };

    // Only a measured contradiction rejects. An unmeasured candidate is not
    // asserted to match the weather asked for — it comes back with no weather at
    // all, which is what the prompt requires us to say about it.
    if (
      query.climate &&
      isMeasured(entry) &&
      climateScore(representativeHighC(entry), query.climate) <= 0
    ) {
      rejected.push({ city: candidate.city, reason: 'wrong-climate' });
      continue;
    }

    verified.push(entry);
  }

  return { verified, rejected };
}

/**
 * Prices the survivors, when there are dates to price against.
 *
 * A nightly rate only means anything for a specific stay, so with no dates this
 * skips the searches altogether rather than quoting something undated — which also
 * keeps a shortlist free when the traveller has not decided when to travel.
 */
async function priceAll(verified: readonly Verified[], query: DestinationQuery): Promise<Priced[]> {
  const datesKnown = Boolean(query.checkIn && query.checkOut);
  // The dates decide the length, not the caller. See `nightsBetween`.
  const nights = nightsBetween(query.checkIn, query.checkOut) ?? query.nights ?? null;

  const costs = datesKnown
    ? await Promise.all(
        verified.map(async (entry) => {
          const hotels = await hotelProvider().searchHotels({
            destination: placeQuery(entry),
            checkIn: query.checkIn,
            checkOut: query.checkOut,
            budgetLevel: query.budgetLevel,
            guests: query.travelers,
            // Only the cheapest rate is read from these, and no hotel card is
            // rendered from a shortlist.
            withImages: false,
          });
          return costFrom(hotels, nights);
        }),
      )
    : verified.map(() => null);

  return verified.map((entry, index) => {
    const cost = costs[index] ?? null;
    return { ...entry, cost, score: scoreOf(entry, cost, query) };
  });
}

const verifyingProvider: DestinationProvider = {
  name: 'model-proposed, tools-verified',

  async recommendDestinations(query: DestinationQuery): Promise<DestinationShortlist> {
    const { verified, rejected } = await verifyAll(query);
    if (verified.length === 0) return { destinations: [], rejected };

    const priced = await priceAll(verified, query);

    // Measured first, whatever the scores say. An unmeasured candidate is judged on
    // fewer dimensions, and `scoreOf` averages over the ones that applied — so a
    // city with nothing but a cheap room could otherwise score a clean 1.0 and
    // displace one that actually passed the climate check. A verified destination
    // is the better answer, and during a real outage none of them are verified, so
    // this only ever decides the mixed case.
    const finalists = priced
      .sort(
        (a, b) =>
          Number(isMeasured(b)) - Number(isMeasured(a)) ||
          b.score - a.score ||
          a.candidate.city.localeCompare(b.candidate.city),
      )
      .slice(0, query.limit ?? DEFAULT_LIMIT);

    // Only the finalists get the two remaining lookups. Sights cost a search each,
    // and photos are paced one at a time by the image provider, so both are worth
    // spending on an answer rather than on a candidate that did not make it.
    const [highlights, images] = await Promise.all([
      Promise.all(
        finalists.map((entry) => {
          const { city, country } = resolvedPlace(entry);
          return activityProvider().searchActivities({
            destination: city,
            country,
            limit: HIGHLIGHTS_WANTED,
            // Names only: the destination card lists them as text.
            withImages: false,
          });
        }),
      ),
      imageProvider().lookup(finalists.map(placeQuery)),
    ]);

    const destinations = finalists.map((entry, index) => {
      const { candidate, cost } = entry;

      return {
        id: `destination-${nameKey(candidate.city)}`,
        // The traveller's and the model's own word for the place, so the card agrees
        // with the prose beside it. Only the lookups use the resolved spelling.
        city: candidate.city,
        country: resolvedPlace(entry).country,
        summary: candidate.why,
        reasons: reasonsFor(entry, cost, query),
        weather: weatherFor(entry),
        cost,
        highlights: (highlights[index] ?? []).map((activity) => activity.name),
        bestMonths: entry.bestMonths.map(monthName),
        image: images.get(placeQuery(entry)) ?? null,
      };
    });

    return { destinations, rejected };
  },
};

/** The seam another verification strategy would be swapped in at. */
export function destinationProvider(): DestinationProvider {
  return verifyingProvider;
}
