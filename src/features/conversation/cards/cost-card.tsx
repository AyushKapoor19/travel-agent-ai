import type { CostEstimate } from '@/features/travel/types';
import { formatPrice } from '@/lib/format';

import { AsideNote } from './band';
import { Ledger, LedgerRow } from './ledger';

/**
 * What the trip can be shown to cost, and what that figure does not cover.
 *
 * The exclusions are not a footnote here, they are half the content, and the layout
 * says so: the total is never printed without them adjacent. This is the one figure a
 * traveller acts on financially, and it is a floor built from two of the four things a
 * trip costs — a number that looks like a total and is not would be the most expensive
 * piece of dishonesty in the app.
 *
 * Hence "From" in front of every figure, and no line anywhere claiming the trip fits
 * a budget. The arithmetic cannot support that claim in the direction people want it.
 */

type CostCardProps = {
  estimate: CostEstimate;
};

export function CostCard({ estimate }: CostCardProps) {
  const {
    currency,
    nights,
    travelers,
    flights,
    lodging,
    activities,
    measuredTotalUsd,
    excluded,
    budget,
  } = estimate;

  const party = `${travelers} ${travelers === 1 ? 'traveller' : 'travellers'}`;

  // Nothing was quoted for either line, so there is no floor to show — only the
  // reason there isn't one, which is more use than a total reading "from $0".
  if (!flights && !lodging && (!activities || activities.priced === 0)) {
    return (
      <AsideNote>
        No prices came back for {estimate.destination}, so there is nothing to total yet
        {nights === null ? ' — a room can only be priced against real dates' : ''}.
      </AsideNote>
    );
  }

  return (
    <div>
      <p className="pb-2.5 text-[0.6875rem] text-ink-muted">
        {party}
        {nights !== null && ` · ${nights} ${nights === 1 ? 'night' : 'nights'}`}
      </p>

      <Ledger>
        {flights && (
          <LedgerRow
            label="Flights"
            detail={[
              `${flights.originAirport} → ${flights.destinationAirport}`,
              flights.roundTrip ? 'round trip' : 'one way',
              // Google's own verdict, which is what makes the fare actionable.
              flights.level ? `${flights.level} for the route` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            amount={formatPrice(flights.totalUsd, currency) ?? ''}
          />
        )}

        {lodging && (
          <LedgerRow
            label="Stay"
            /* Two flags, both about the figure meaning less than it appears to. The
               basis is called out when the priced room is not the one in the prose,
               and the room count when the rate was multiplied rather than quoted. */
            detail={[
              `${lodging.property}${lodging.basis === 'cheapest' ? ' (cheapest quoted)' : ''}`,
              `from ${formatPrice(lodging.nightlyUsd, currency)} a night`,
              lodging.rooms > 1 ? `${lodging.rooms} rooms` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            amount={`from ${formatPrice(lodging.stayTotalUsd, currency)}`}
          />
        )}

        {activities && activities.priced > 0 && (
          <LedgerRow
            label="Entry"
            detail={`${activities.priced} ${activities.priced === 1 ? 'place' : 'places'} with a listed price, for ${party}`}
            amount={formatPrice(activities.entryTotalUsd, currency) ?? ''}
          />
        )}
      </Ledger>

      <div className="mt-3 flex items-baseline justify-between gap-4">
        <p className="label text-ink-muted">Measured so far</p>
        <p className="figure text-lg text-ink">from {formatPrice(measuredTotalUsd, currency)}</p>
      </div>

      {/* Deliberately adjacent to the total rather than below the fold. */}
      <p className="mt-2 text-[0.6875rem] leading-relaxed text-ink-soft">
        Not included: {excluded.join(', ')}.
        {activities && activities.unpriced > 0 && (
          <>
            {' '}
            {activities.unpriced} more {activities.unpriced === 1 ? 'place lists' : 'places list'}{' '}
            no price.
          </>
        )}
        {activities && activities.free > 0 && (
          <>
            {' '}
            {activities.free} {activities.free === 1 ? 'is' : 'are'} free.
          </>
        )}
      </p>

      {budget && (
        <div className="mt-3 border-t border-line pt-2.5">
          {/* Neither line names what is missing, because the line above already did and
              the list changes: when no room could be priced, "before flights or food"
              would be the understatement that matters. */}
          {budget.alreadyExceeded ? (
            <p className="text-xs leading-relaxed text-ink">
              Already over your {formatPrice(budget.ceilingUsd, currency)} by{' '}
              <span className="figure">
                {formatPrice(Math.abs(budget.unallocatedUsd), currency)}
              </span>
              , counting only what is listed above.
            </p>
          ) : (
            <p className="text-xs leading-relaxed text-ink-soft">
              Leaves{' '}
              <span className="figure text-ink">
                {formatPrice(budget.unallocatedUsd, currency)}
              </span>{' '}
              of your {formatPrice(budget.ceilingUsd, currency)} unallocated — everything not
              included above still comes out of it.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
