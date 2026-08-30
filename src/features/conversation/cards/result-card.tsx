'use client';

import { motion } from 'motion/react';

import type { PlaceImage } from '@/features/photos/shared';
import { SPRING, stagger } from '@/lib/design/motion';
import { formatRating } from '@/lib/format';

import { Plate } from './plate';

export type ResultCardProps = {
  /** Stagger position in the grid. */
  index: number;
  /** Seeds the fallback gradient; the result's own id. */
  seed: string;
  title: string;
  rating: number;
  /** What it is: a property type, or an activity's category. */
  kind: string;
  /** One line under the title: stars and reviews, or duration and reviews. */
  meta: string;
  description: string;
  image: PlaceImage | null;
  /** What the photo shows when that is not the subject, e.g. "Nearby". */
  photoNote?: string;
  /** Already formatted, or null when the provider gave no price. */
  price: string | null;
  /** Qualifies the price, e.g. "/ night". */
  priceUnit?: string;
  /**
   * Anything worth a line beside the price, e.g. cancellation terms. Omitted
   * rather than blank when the source has nothing to put here.
   */
  note?: string;
  bookingUrl: string;
  provider: string;
  /**
   * The verb on the link. "Book on" for somewhere that takes a reservation,
   * "View on" for a link that only leads back to where the figures came from.
   */
  actionLabel?: string;
};

const DEFAULT_ACTION_LABEL = 'Book on';

/**
 * The plate every search result is drawn as.
 *
 * Stays and activities had a card each and they were the same card, so the layout
 * is here once and a stay or an activity is a mapping onto it. Everything this
 * takes is already presentational: the mapper does the rounding and the wording,
 * and this file has no opinion about hotels.
 *
 * What changed is what it is drawn as. It was a glass card — fill, rim, shadow,
 * a rating badge over the photograph and a black pill at the foot — and three of
 * them beside a fare panel and a totals panel is a feed of widgets, which is the
 * thing this plan is not. Now the photograph is the only object and the rest is
 * set on the page under it: the name, a rule, then the figure and the hand-off
 * on one baseline. The rule is what lines the results up as a set, and it does
 * the job the card outline used to do for a tenth of the ink.
 */
export function ResultCard({
  index,
  seed,
  title,
  rating,
  kind,
  meta,
  description,
  image,
  photoNote,
  price,
  priceUnit,
  note,
  bookingUrl,
  provider,
  actionLabel = DEFAULT_ACTION_LABEL,
}: ResultCardProps) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING.element, delay: stagger(index) }}
      className="flex flex-col"
    >
      <Plate seed={seed} fallbackLabel={kind} image={image} caption={photoNote} />

      <div className="mt-3.5 flex flex-1 flex-col">
        <div className="flex items-baseline justify-between gap-2.5">
          <h4 className="text-[0.9375rem] font-semibold leading-snug tracking-[-0.015em] text-ink">
            {title}
          </h4>

          <p className="figure shrink-0 text-[0.8125rem] text-ink-soft">
            <span className="sr-only">Rated </span>
            {formatRating(rating)}
          </p>
        </div>

        <p className="mt-1 text-xs text-ink-muted">{[kind, meta].filter(Boolean).join(' · ')}</p>

        {description && (
          <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-soft">{description}</p>
        )}

        {note && <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-ink-muted">{note}</p>}

        {/* Grows, so the rule and the figure sit on one line across a row of
            results whose descriptions are different lengths. */}
        <div className="mt-3.5 flex flex-1 items-end">
          <div className="flex w-full flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-line pt-2.5">
            {price && (
              <p className="figure text-[0.8125rem] text-ink">
                {price}
                {priceUnit && <span className="ml-1 text-ink-muted">{priceUnit}</span>}
              </p>
            )}

            <a
              href={bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="link-out ml-auto text-[0.75rem]"
            >
              {actionLabel} {provider}
            </a>
          </div>
        </div>
      </div>
    </motion.article>
  );
}
