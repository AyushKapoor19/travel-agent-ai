'use client';

import { motion } from 'motion/react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { EASE, STEP } from '@/lib/design/motion';

type LineRevealProps = {
  /** One entry per visual line. Lines are not wrapped; you choose the breaks. */
  lines: ReactNode[];
  /** Play on mount rather than on scroll. For anything above the fold. */
  immediate?: boolean;
  /**
   * Drive the reveal from a boolean instead of from the viewport. For a headline
   * whose visibility is not a matter of where the page is scrolled to — inside a
   * panel that is moved by a transform, an intersection observer is asked to
   * decide something it can only find out about after the fact, and the reveal
   * either fires a frame late or, if the observer settled before the panel was
   * put in place, never.
   */
  play?: boolean;
  delay?: number;
  className?: string;
};

/**
 * Headline lines sliding up from behind their own baseline.
 *
 * Each line gets its own clipping box, so the type appears to be uncovered
 * rather than moved — the reason to do this at all instead of fading a whole
 * heading at once.
 *
 * The padding/negative-margin pair widens the clip below the baseline so
 * descenders are not sheared off, without adding leading between the lines.
 *
 * Under `prefers-reduced-motion` the provider drops transforms entirely, so
 * the lines are simply in place from the first frame.
 */
export function LineReveal({
  lines,
  immediate = false,
  play,
  delay = 0,
  className,
}: LineRevealProps) {
  const driven = play !== undefined;

  return (
    <span className={cn('block', className)}>
      {lines.map((line, index) => {
        const animation = {
          initial: { y: '110%' },
          transition: { duration: 1.05, ease: EASE, delay: delay + index * STEP },
        };

        return (
          <span key={index} className="block overflow-hidden pb-[0.14em] [margin-bottom:-0.14em]">
            <motion.span
              className="block"
              {...animation}
              {...(driven || immediate
                ? { animate: { y: driven && !play ? '110%' : '0%' } }
                : {
                    whileInView: { y: '0%' },
                    viewport: { once: true, margin: '-12%' },
                  })}
            >
              {line}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}
