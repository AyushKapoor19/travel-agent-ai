'use client';

import { useEffect, useState } from 'react';

import { PhotoCreditLink } from '@/features/photos/photo-credit-link';
import { PlacePhoto } from '@/features/photos/place-photo';
import { usePlaceImages } from '@/features/photos/use-place-image';
import { classNames } from '@/lib/class-names';
import { gradientCss } from '@/lib/design/gradient';

import {
  DESTINATION_QUERIES,
  destinationPrompt,
  FEATURED_DESTINATIONS,
} from './featured-destinations';
import { useTripHandoff } from './trip-handoff';

/**
 * Source width to ask Commons for, and the width the preview is drawn at.
 *
 * One column of a spread rather than a cover, so this is a fraction of the
 * bytes of the default. Commons answers a caller who has taken too many with
 * 429 rather than a queue, and eight full-width photographs here is how the
 * back half of the set ends up with nothing to draw.
 */
const PREVIEW_SOURCE_WIDTH = 720;
const PREVIEW_SIZES = '336px';

/**
 * The width the spread has room for a photograph at. Tailwind's `xl`, and it
 * has to stay Tailwind's `xl`: the grid track the preview sits in is declared
 * with the utility, and the two disagreeing means either an empty column or a
 * photograph with nowhere to go.
 */
const PREVIEW_BREAKPOINT = '(min-width: 80rem)';

/** Nothing to look up. Module scope, because it is a hook dependency. */
const NO_QUERIES: readonly string[] = [];

/**
 * How long a photograph holds before the index moves down a line on its own.
 *
 * The crossfade eats the first fifth of it, so this is a little over two
 * seconds settled — enough to be looked at rather than caught, and short enough
 * that a reader sees most of the eight before deciding the panel is static.
 */
const DWELL_MS = 2000;

/**
 * Whether the panel is wide enough to be drawing the preview.
 *
 * Asked in JavaScript as well as in CSS because `hidden` is not "absent": eight
 * photographs behind a `display: none` are eight photographs Commons still
 * serves and a phone still pays for, on the one layout that was never going to
 * show them.
 */
function usePreviewColumn(): boolean {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(PREVIEW_BREAKPOINT);
    const sync = () => setShown(media.matches);

    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  return shown;
}

type DestinationIndexProps = {
  /** Whether this is the panel being looked at. The rotation suspends when it is not. */
  live: boolean;
  className?: string;
};

/**
 * Eight cities, set as the index of a printed guide.
 *
 * This was a rail of photographs that drifted past on a ticker, and the reason
 * it is not one any more is that a carousel answers a question nobody asked. The
 * panel's job is to name eight places and get out of the way; a run of moving
 * tiles instead asks the reader to track something, cropped two of the eight at
 * the window's edges at any moment, and put eight competing photographs on the
 * one screen of the site that is supposed to be quiet.
 *
 * So the cities are a ruled list — numeral, place, country, a rule under each —
 * which is the same vocabulary the planning surface is drawn in and the only
 * place the landing page speaks it. Hierarchy comes from size, weight and a
 * hairline, and nothing on the panel moves until the reader points at it.
 *
 * The photographs are not gone, they are down to one: the line under the cursor
 * is the one being looked at, so it is the only one worth showing. All eight are
 * still fetched together and crossfade in place, because a photograph that
 * starts loading on hover arrives after the reader has moved on.
 *
 * Left alone, it works its way down the list by itself. A single photograph that
 * never changes until it is pointed at is a photograph nobody finds out they can
 * point at, and eight cities are worth more than the one that happens to be
 * first. It is a crossfade on a five-second timer rather than anything that
 * moves, so the panel is still a page rather than a slideshow — and the numeral
 * and rule following it down are what say the two halves are the same object.
 */
export function DestinationIndex({ live, className }: DestinationIndexProps) {
  const { start, leaving } = useTripHandoff();

  /**
   * Which line the preview is showing. The first, until the reader says
   * otherwise — a preview waiting for a hover is a blank column on a phone,
   * where there will never be one.
   */
  const [active, setActive] = useState(0);

  /**
   * The reader is in the list. Either of these stops the rotation dead: a
   * photograph that changes under someone comparing two lines is the page
   * arguing with them.
   *
   * Two flags rather than one, because they end at different moments. A mouse
   * leaving while a line is still focused would otherwise hand the preview back
   * to the timer and walk it away from the line the keyboard is sitting on.
   */
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  const showPreview = usePreviewColumn();

  /**
   * Nothing turns over off screen, on a panel with no photograph to turn over,
   * or for a reader who has asked for less motion. The last of those is checked
   * here rather than left to the stylesheet: the global rule collapses the
   * crossfade's duration, which would leave the photographs cutting between one
   * another on a timer — louder than the thing it was meant to quieten.
   */
  const rotating = live && showPreview && !hovered && !focused;

  // Fetched as one batch and held back until the browser is idle, so none of it
  // competes with the hero's globe — two megabytes the reader is actually
  // looking at, one panel above this.
  const images = usePlaceImages(showPreview ? DESTINATION_QUERIES : NO_QUERIES, {
    width: PREVIEW_SOURCE_WIDTH,
    deferUntilIdle: true,
  });

  useEffect(() => {
    if (!rotating) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const timer = window.setInterval(() => {
      setActive((current) => (current + 1) % FEATURED_DESTINATIONS.length);
    }, DWELL_MS);

    return () => window.clearInterval(timer);
    // Restarted rather than resumed whenever the reader lets go, so the line
    // they left it on gets a full turn rather than the tail of the last one.
  }, [rotating]);

  const activeImage = images[FEATURED_DESTINATIONS[active]!.query];

  return (
    <div
      // On the whole spread rather than on the list: the photograph is half of
      // what is being looked at, and it should not slide out from under a reader
      // who has moved across to read the credit. Focus and blur both bubble.
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      className={classNames(
        'grid gap-[clamp(1.25rem,2.5vw,3rem)] xl:grid-cols-[minmax(0,1fr)_clamp(15rem,19vw,21rem)]',
        className,
      )}
    >
      <div>
        <h3 className="section-rule text-ink-muted">Eight to start with</h3>

        {/* Two columns only where the list is the full width of the panel. Eight
            lines run the height of a tablet on their own, and a line half a
            metre wide sets the country so far from the city that the pair stops
            reading as one entry. Beside the statement it is a column again. */}
        <ol className="mt-[clamp(0.5rem,1.4vh,1rem)] md:grid md:grid-cols-2 md:gap-x-10 lg:block">
          {FEATURED_DESTINATIONS.map((destination, index) => {
            // Marked only where there is a preview for it to be pointing at. On
            // a narrow window it would be a rule drawn darker than its
            // neighbours for a reason nothing on the screen can explain.
            const showing = showPreview && index === active;
            const prompt = destinationPrompt(destination);

            return (
              <li key={destination.city}>
                <button
                  type="button"
                  disabled={leaving}
                  onClick={() => start(prompt)}
                  onMouseEnter={() => setActive(index)}
                  onFocus={() => setActive(index)}
                  data-active={showing ? '' : undefined}
                  aria-label={`Plan a trip to ${prompt}`}
                  className="group flex w-full items-baseline gap-[clamp(0.75rem,1.4vw,1.5rem)] border-b border-line py-[clamp(0.45rem,1.35vh,0.9rem)] text-left transition-colors duration-300 ease-wayfare hover:border-ink disabled:cursor-not-allowed data-[active]:border-ink/45"
                >
                  <span className="figure w-6 shrink-0 text-[0.6875rem] text-ink-muted transition-colors duration-300 ease-wayfare group-data-[active]:text-ink-soft">
                    {String(index + 1).padStart(2, '0')}
                  </span>

                  <span className="grow truncate text-[clamp(1.0625rem,0.5vw+0.85rem,1.375rem)] font-medium tracking-[-0.03em] text-ink">
                    {destination.city}
                  </span>

                  <span className="shrink-0 text-[0.8125rem] tracking-[-0.01em] text-ink-muted">
                    {destination.country}
                  </span>

                  {/* Reserved rather than revealed into the gap: a mark that
                      appears on hover must not be the reason the line beside it
                      moves. */}
                  <span
                    aria-hidden
                    className="w-3 shrink-0 -translate-x-1 text-ink opacity-0 transition-all duration-300 ease-wayfare group-hover:translate-x-0 group-hover:opacity-100"
                  >
                    →
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Drawn only where there is a column to spare, and pinned to the outside
          edge of the spread rather than dropped between the question and the
          answers. Below `xl` the list is the whole of it, which is the layout
          this section is designed around rather than a degraded version of one. */}
      {showPreview && (
        <figure
          className="relative overflow-hidden rounded-[var(--radius-glass-sm)]"
          style={{ background: gradientCss(FEATURED_DESTINATIONS[active]!.city) }}
        >
          {/* All eight are mounted and only one is opaque. Swapping a single
            `src` would show the gap between the old photograph leaving and the
            new one decoding, which on a hover is the whole of the interaction. */}
          {FEATURED_DESTINATIONS.map((destination, index) => {
            const image = images[destination.query];
            if (!image) return null;

            return (
              <PlacePhoto
                key={destination.city}
                url={image.url}
                // Decorative: the city it belongs to is spelled out on the line
                // the reader is pointing at, immediately to the left.
                alt=""
                fill
                sizes={PREVIEW_SIZES}
                className={classNames(
                  'object-cover transition-opacity duration-700 ease-wayfare',
                  index === active ? 'opacity-100' : 'opacity-0',
                )}
              />
            );
          })}

          {activeImage && (
            <>
              <div
                aria-hidden
                className="absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-black/45 to-transparent"
              />

              <PhotoCreditLink
                image={activeImage}
                context={FEATURED_DESTINATIONS[active]!.city}
                variant="credit"
                className="absolute bottom-2 left-3 max-w-[80%] text-[0.5625rem] text-white/60 hover:text-white"
              />
            </>
          )}
        </figure>
      )}
    </div>
  );
}
