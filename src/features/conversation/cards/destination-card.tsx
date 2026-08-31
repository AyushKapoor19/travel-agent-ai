'use client';

import { motion } from 'motion/react';

import type { DestinationSuggestion, ReasonKind } from '@/features/travel/types';
import { SPRING, stagger } from '@/lib/design/motion';
import { formatPrice } from '@/lib/format';

import { photoCaption } from './photo-caption';
import { Plate } from './plate';

/**
 * A place the traveller might go, and the grounds for sending them there.
 *
 * Not a `ResultCard`, and that is deliberate rather than a shortcut avoided. A
 * stay and an activity are the same shape — a rating, a price, a booking hand-off —
 * so they share a layout. A destination has no rating and nothing to book; what it
 * has is evidence — the measured kind. Every figure on it was returned by a
 * provider: the temperatures by the archive, the rate by what Google is quoting for
 * these dates, the highlights by the sights actually listed for the city. The one
 * line the model wrote is `summary`, and it sits apart from the reasons for exactly
 * that reason.
 */

/** Three is what fits before the plate stops being scannable. */
const REASONS_SHOWN = 3;
const HIGHLIGHTS_SHOWN = 3;

/**
 * Reason kinds this plate states in its own right, and therefore does not repeat.
 *
 * The temperature line covers `climate`; the footer covers `cost`. Rendering them
 * again put "Highs around 27°C in September" directly under a row reading
 * "September · warm and dry", and for Lisbon two of the three visible reasons were
 * restatements. What survives is the seasonal judgement, which the plate has
 * nowhere else to put.
 */
const KINDS_SHOWN_ELSEWHERE: readonly ReasonKind[] = ['climate', 'cost'];

/**
 * What the price covers, said plainly.
 *
 * Narrower than the "before flights" it replaced, and accurate where that was not:
 * the figure is a room rate, so it excludes the food and local transport the old
 * all-in daily estimate silently claimed to include.
 */
const COST_CAVEAT = 'lodging only';

type DestinationCardProps = {
  destination: DestinationSuggestion;
  index: number;
};

export function DestinationCard({ destination, index }: DestinationCardProps) {
  const { city, country, summary, weather, highlights, image } = destination;

  const reasons = destination.reasons
    .filter((reason) => !KINDS_SHOWN_ELSEWHERE.includes(reason.kind))
    .slice(0, REASONS_SHOWN);

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING.element, delay: stagger(index) }}
      className="flex flex-col"
    >
      <Plate
        seed={destination.id}
        fallbackLabel={country}
        image={image}
        caption={photoCaption(destination.image, destination.city)}
      />

      <div className="mt-3.5 flex flex-1 flex-col">
        <div className="flex items-baseline justify-between gap-2.5">
          <h4 className="display-md text-ink">
            {city}
            <span className="ml-2 align-baseline text-xs font-normal tracking-normal text-ink-muted">
              {country}
            </span>
          </h4>

          {weather && (
            <p className="figure shrink-0 text-[0.8125rem] text-ink-soft">
              {Math.round(weather.highC)}°/{Math.round(weather.lowC)}°
            </p>
          )}
        </div>

        {weather && (
          <p className="mt-1.5 text-xs text-ink-muted">
            {weather.month} · {weather.summary}
          </p>
        )}

        <p className="mt-2.5 text-[0.875rem] leading-relaxed text-ink-soft">{summary}</p>

        {reasons.length > 0 && (
          <ul className="mt-3 space-y-1">
            {reasons.map((reason) => (
              <li key={reason.text} className="flex gap-2 text-xs leading-relaxed text-ink-soft">
                <span aria-hidden className="text-ink-muted">
                  —
                </span>
                {reason.text}
              </li>
            ))}
          </ul>
        )}

        {/* Grows, so the cost row lines up across a row of plates whose reason
            lists are different lengths. */}
        {highlights.length > 0 && (
          <div className="mt-4 flex-1">
            <p className="label text-ink-muted">Highlights</p>
            <ul className="mt-1.5 space-y-0.5">
              {highlights.slice(0, HIGHLIGHTS_SHOWN).map((highlight) => (
                <li key={highlight} className="text-xs leading-relaxed text-ink-soft">
                  {highlight}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4 border-t border-line pt-2.5">
          {destination.cost && (
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="figure text-[0.8125rem] text-ink">{costLine(destination.cost)}</p>
              <p className="text-[0.6875rem] text-ink-muted">{COST_CAVEAT}</p>
            </div>
          )}

          {/* Where the figures came from, on the page rather than only in the prose.
              It is the difference between a number and a claim, and this is the one
              place a reader can check it against nothing else. */}
          {weather && (
            <p className="mt-1.5 text-[0.6875rem] leading-snug text-ink-muted/70">
              {weather.source}
            </p>
          )}
        </div>
      </div>
    </motion.article>
  );
}

/**
 * The whole stay when we know how long it is, and the nightly rate when we do not.
 *
 * A total is the figure a budget is actually spent against — "under $2000 for 5
 * days" is the question being answered — but it needs a night count to exist, and
 * "from" is load-bearing either way: this is the cheapest property that came back,
 * not an average, and the plate should not read as though it were one.
 */
function costLine(cost: NonNullable<DestinationSuggestion['cost']>): string {
  const nightly = `from ${formatPrice(cost.nightlyFromUsd, cost.currency)}/night`;

  if (cost.stayTotalUsd !== null && cost.nights !== null) {
    return `${formatPrice(cost.stayTotalUsd, cost.currency)} · ${nightly}`;
  }

  return nightly;
}
