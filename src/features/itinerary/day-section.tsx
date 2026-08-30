'use client';

import { motion } from 'motion/react';

import { Markdown } from '@/components/ui/markdown';
import { PlacePhoto } from '@/features/photos/place-photo';
import { photoCreditTitle } from '@/features/photos/shared';
import { usePlaceImage } from '@/features/photos/use-place-image';
import { SPRING, stagger } from '@/lib/design/motion';
import { useSettledValue } from '@/lib/use-settled-value';

import { dayImageQuery } from './day-query';

/**
 * How long a day heading must stop changing before it is worth a photo lookup.
 *
 * Headings arrive a token at a time while the itinerary streams, so querying on every
 * render would fire a request per character.
 */
const HEADING_SETTLE_MS = 900;

/** A band across a phone, and a plate beside the prose from `sm` up. */
const PLATE_SIZES = '(max-width: 640px) 100vw, 160px';

const PLATE_FADE_SECONDS = 0.4;

type DaySectionProps = {
  /** As the agent numbered it, or null when it wrote a heading with no number. */
  number: string | null;
  title: string;
  /** Markdown for the day. Still streaming, so it may be a partial paragraph. */
  body: string;
  /** Position in the plan, which sets the section's turn in the reveal. */
  index: number;
  /** Scopes the day's photo lookup, so "Old town" resolves to the right city. */
  destination: string;
};

/** Two digits, so every numeral in the margin sits on the same axis. */
function pad(number: string | null, index: number): string {
  return String(number ?? index + 1).padStart(2, '0');
}

/**
 * One day of the plan.
 *
 * A ruled section with the number hanging in the margin, where this used to be a glass
 * card on a timeline. The card was the problem in miniature: the plan is a document, and
 * a document made of a dozen floating cards — each with its own fill, rim and shadow,
 * inside a panel with the same — has no page for anything to be printed on. A hairline
 * and a figure carry the same structure and leave the prose as the only thing with any
 * weight, which is what a guidebook page does.
 */
export function DaySection({ number, title, body, index, destination }: DaySectionProps) {
  const query = useSettledValue(
    destination ? dayImageQuery(title, destination) : null,
    HEADING_SETTLE_MS,
  );
  const image = usePlaceImage(query);

  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING.element, delay: stagger(index) }}
      className="flex gap-5 border-t border-line pt-6 sm:gap-8"
    >
      <p aria-hidden className="figure w-6 shrink-0 pt-1 text-[0.8125rem] text-ink-muted sm:w-8">
        {pad(number, index)}
      </p>

      {/* Reversed on a phone so the photograph sits above the day it illustrates, and
          beside it from the width at which there is room for a column of both. */}
      <div className="flex min-w-0 flex-1 flex-col-reverse gap-4 sm:flex-row sm:items-start sm:gap-7">
        <div className="min-w-0 flex-1">
          <h3 className="display-md text-balance text-ink">{title}</h3>
          {body && (
            <div className="mt-3">
              <Markdown content={body} />
            </div>
          )}
        </div>

        {image && (
          <motion.a
            href={image.pageUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={photoCreditTitle(image)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: PLATE_FADE_SECONDS }}
            // Shallower on a phone, where it is a full-width band and seven of them
            // at 4:3 would be most of the scroll.
            className="relative aspect-[16/9] w-full shrink-0 overflow-hidden rounded-[var(--radius-glass-sm)] sm:aspect-[4/3] sm:w-40"
          >
            <PlacePhoto
              url={image.url}
              alt={image.subject}
              fill
              sizes={PLATE_SIZES}
              className="object-cover"
            />
          </motion.a>
        )}
      </div>
    </motion.article>
  );
}
