import type { FareInsight, FlightFare } from '@/features/travel/types';
import { classNames } from '@/lib/class-names';
import { formatDateRange, formatPrice, formatShortDate } from '@/lib/format';
import { MINUTES_PER_HOUR } from '@/lib/time';

import { AsideNote } from './band';
import { type FareScale, fareScale } from './fare-scale';
import { Ledger } from './ledger';

/**
 * Fares for a route, with Google's own read on whether they are any good.
 *
 * The insight is the reason this is worth drawing rather than leaving as a price in a
 * sentence. A fare on its own is unactionable — nobody knows whether $753 to Lisbon is
 * a bargain or a fleecing — and "is this a good time to book" is the question a travel
 * agent actually gets asked. Google answers it against its own history for the route
 * and season, which makes it the one judgement in this app that arrives measured rather
 * than asserted, so it is shown in Google's wording and not ours.
 *
 * Drawn as a route, a line per fare and a scale. Each fare used to take two lines — the
 * airline, then its stops, duration and "Round trip" underneath — which printed the
 * words "Round trip" three times for one round trip and gave a set of three fares the
 * footprint of a paragraph. Everything shared by every fare is said once in the route
 * line now, so a fare is one line: who flies it, how, and what it costs.
 */

type FlightCardProps = {
  fares: readonly FlightFare[];
  insight: FareInsight | null;
  origin: string;
  destination: string;
  travelers: number;
  /** Outbound date as YYYY-MM-DD, so the band says which days it priced. */
  departDate?: string;
  returnDate?: string;
};

/** Google reports minutes; nobody reads a journey in minutes. */
function duration(minutes: number | null): string | null {
  if (minutes === null || minutes <= 0) return null;

  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  const rest = minutes % MINUTES_PER_HOUR;

  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

function stopsLabel(stops: number): string {
  if (stops === 0) return 'Direct';
  return stops === 1 ? '1 stop' : `${stops} stops`;
}

/** Google's verdict, spelled out against the band it is a verdict about. */
function insightLine(insight: FareInsight, currency: string): string {
  const { level, typicalLowUsd, typicalHighUsd } = insight;

  const band =
    typicalLowUsd === null || typicalHighUsd === null
      ? null
      : `${formatPrice(typicalLowUsd, currency)}–${formatPrice(typicalHighUsd, currency)}`;

  return band
    ? `Google calls this ${level} for the route — it usually runs ${band}`
    : `Google calls this ${level} for the route`;
}

/**
 * What every fare in the set has in common, said once above them.
 *
 * The trip kind only when all three agree on it, which they do whenever the search was
 * a round trip or a one way rather than a mix. The party size always, and worded as a
 * total: these are prices for everyone travelling, and every fare a traveller has been
 * quoted this week was per person.
 */
function routeMeta(
  fares: readonly FlightFare[],
  travelers: number,
  departDate?: string,
  returnDate?: string,
): string {
  const roundTrip = fares.every((fare) => fare.roundTrip);
  const oneWay = fares.every((fare) => !fare.roundTrip);

  const window =
    departDate && returnDate
      ? formatDateRange(departDate, returnDate)
      : departDate
        ? formatShortDate(departDate)
        : null;

  return [
    roundTrip ? 'Round trip' : oneWay ? 'One way' : null,
    window,
    `total for ${travelers} ${travelers === 1 ? 'traveller' : 'travellers'}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** The scale, hidden from readers who cannot see it: the caption under it says all of this. */
function FareScaleStrip({ scale }: { scale: FareScale }) {
  return (
    <div aria-hidden className="relative h-2.5">
      <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line" />

      <span
        className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-ink/15"
        style={{ left: `${scale.band.left}%`, width: `${scale.band.width}%` }}
      />

      {/* The cheapest is the one being offered, so it is the full height of the scale in
          full ink; the others are the context for it and sit at a quarter of the weight.
          Not the accent, which at two pixels of #ffd400 on a warm page is a mark you
          have to be told is there. */}
      {scale.marks.map((left, index) => (
        <span
          key={index}
          className={classNames(
            'absolute w-[2px] -translate-x-1/2 rounded-full',
            index === 0 ? 'inset-y-0 bg-ink' : 'top-1/2 h-1.5 -translate-y-1/2 bg-ink/30',
          )}
          style={{ left: `${left}%` }}
        />
      ))}
    </div>
  );
}

export function FlightCard({
  fares,
  insight,
  origin,
  destination,
  travelers,
  departDate,
  returnDate,
}: FlightCardProps) {
  if (fares.length === 0) {
    return (
      <AsideNote>
        No fares came back for {origin} to {destination} on those dates. That is worth saying
        plainly rather than guessing at a price.
      </AsideNote>
    );
  }

  const currency = fares[0]?.currency ?? 'USD';

  // Cheapest first. Google returns its own shortlist in its own "best" order, which
  // balances price against duration and so arrives unsorted — and a column of figures
  // out of order reads as three unrelated numbers rather than as a range.
  const listed = [...fares].sort((a, b) => a.priceUsd - b.priceUsd);
  const scale = fareScale(
    listed.map((fare) => fare.priceUsd),
    insight,
  );

  // Google's own search page, which is the same URL on every fare: a fare is only
  // bookable through the live page, so there is one link out and not three.
  const bookingUrl = listed.find((fare) => fare.bookingUrl)?.bookingUrl;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1.5 pb-3">
        {/* The route as a route. Two codes and the leg between them is the one thing on
            a ticket a traveller reads without being asked to. */}
        <p className="flex items-center gap-3 text-base font-semibold tracking-[-0.02em] text-ink">
          {origin}
          <span className="sr-only"> to </span>
          <span aria-hidden className="w-10 border-t border-dashed border-ink/30 sm:w-16" />
          {destination}
        </p>

        <p className="text-[0.75rem] text-ink-muted">
          {routeMeta(listed, travelers, departDate, returnDate)}
        </p>
      </div>

      <Ledger>
        {listed.map((fare, index) => (
          <li key={fare.id} className="flex items-baseline gap-x-3 py-2.5">
            <p className="min-w-0 truncate text-[0.8125rem] text-ink">
              {fare.airlines.join(' + ') || 'Airline not listed'}
            </p>

            <p className="shrink-0 text-[0.75rem] text-ink-muted">
              {[stopsLabel(fare.stops), duration(fare.durationMinutes)].filter(Boolean).join(' · ')}
            </p>

            {/* The cheapest carries the ink, so the answer to "what does this cost" is
                one figure and the other two are the context for it. */}
            <p
              className={classNames(
                'figure ml-auto shrink-0 text-[0.8125rem]',
                index === 0 ? 'text-ink' : 'text-ink-soft',
              )}
            >
              {formatPrice(fare.priceUsd, fare.currency)}
            </p>
          </li>
        ))}
      </Ledger>

      {/* Clear of the ledger's closing rule, which is a hairline the width of the band
          and would otherwise read as part of the scale. */}
      <div className="mt-5">
        {scale && <FareScaleStrip scale={scale} />}

        <div
          className={classNames(
            'flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1',
            scale && 'mt-2.5',
          )}
        >
          {insight && (
            <p className="text-[0.6875rem] leading-relaxed text-ink-soft">
              {insightLine(insight, currency)}.
            </p>
          )}

          {bookingUrl && (
            <a
              href={bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="link-out ml-auto text-[0.75rem]"
            >
              Open in Google Flights
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
