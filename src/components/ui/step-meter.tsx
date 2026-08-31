'use client';

import { AnimatePresence, motion } from 'motion/react';

import { easeTransition } from '@/lib/design/motion';

type StepMeterProps = {
  /** Zero-based position of the question being asked. */
  index: number;
  total: number;
};

/** Two digits, so the counter does not change width between the ninth and tenth. */
function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * How far through the questions this is, as a figure rather than as a row of dots.
 *
 * It replaced seven dots and a label. The dots were honest about the shape of the
 * intake and said nothing a reader could act on — you cannot count five faint
 * circles at a glance — and the label beside them repeated the field name that the
 * stub underneath already gives, in the same tracked-out caps, two inches apart.
 *
 * A counter says the one thing dots were there to say: this ends, and here is where
 * you are in it.
 *
 * The figure counts up rather than replacing itself, in the same direction the question
 * below it travels — the answered number leaves upward and the next one comes from
 * below, so the two moves read as one.
 */

/** Kept short: this is a two-character figure, not a paragraph changing places. */
const COUNT_RISE_PX = 8;
const COUNT_SECONDS = 0.34;

export function StepMeter({ index, total }: StepMeterProps) {
  const position = Math.min(index + 1, total);

  return (
    <p className="figure text-[0.8125rem] text-ink-muted">
      {/* Fixed to the width of the figure it holds, so the slash does not step sideways
          as the number is handed over. */}
      <span className="relative inline-block w-[2ch] overflow-hidden text-ink align-bottom">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={position}
            initial={{ opacity: 0, y: COUNT_RISE_PX }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -COUNT_RISE_PX }}
            transition={easeTransition(COUNT_SECONDS)}
            className="inline-block"
          >
            {pad(position)}
          </motion.span>
        </AnimatePresence>
      </span>
      <span aria-hidden> / {pad(total)}</span>
      <span className="sr-only"> of {total} questions</span>
    </p>
  );
}
