'use client';

import { useState } from 'react';

import { AnimatePresence, motion } from 'motion/react';

import { AnswerField } from '@/components/ui/answer-field';
import { QuickReplyChip } from '@/components/ui/quick-reply-chip';
import { RouteWait } from '@/components/ui/route-wait';
import { classNames } from '@/lib/class-names';
import { easeTransition } from '@/lib/design/motion';

import { useTripHandoff } from './trip-handoff';

const PLACEHOLDER = 'A long weekend somewhere warm…';

/** How long the openers take to clear, once one of them has started a trip. */
const CLEAR_SECONDS = 0.22;

type TripComposerProps = {
  /** Distinct per instance, for the field's label. */
  id: string;
  /** One-tap openers, shown under the line. */
  openers?: readonly string[];
  className?: string;
};

/**
 * The first question's answer line, on the poster.
 *
 * This is the same component the conversation is conducted through, deliberately and
 * not by coincidence. What used to be here was a glass pill with a yellow *Plan it* on
 * the end of it — a good-looking object, and one that made the landing page and the
 * product two different pieces of software: you aimed a cursor at a floating capsule,
 * pressed a coloured button, and arrived at a screen with a hairline and a caret on it
 * that shared none of those properties.
 *
 * A rule and a caret under the headline is a quieter opening and a truer one. The
 * headline asks where you want to go, the line under it is where you answer, and it is
 * question one of the seven — so the page is already the form, and the hand-off has
 * nothing left to introduce.
 *
 * Left inside a centred column, which is the one thing here that cannot be centred: a
 * caret waiting in the middle of a rule is not a place to write, and the sentence would
 * reflow around its own midpoint as it was typed.
 */
export function TripComposer({ id, openers, className }: TripComposerProps) {
  const { start, leaving } = useTripHandoff();
  const [value, setValue] = useState('');

  return (
    <div className={classNames('w-full text-left', className)}>
      <AnswerField
        id={id}
        value={value}
        onChange={setValue}
        onSubmit={() => start(value)}
        busy={leaving}
        placeholder={PLACEHOLDER}
      />

      {/* One slot, the way the intake has one: the openers until a trip starts, then the
          same wait the conversation shows while it reads an answer. Held at a height so
          the planet below does not step up the screen as they swap. */}
      {openers && openers.length > 0 && (
        <div className="mt-6 flex min-h-9 justify-center">
          <AnimatePresence mode="wait" initial={false}>
            {leaving ? (
              <motion.div
                key="wait"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={easeTransition(CLEAR_SECONDS)}
              >
                <RouteWait label="Reading that" />
              </motion.div>
            ) : (
              <motion.div
                key="openers"
                exit={{ opacity: 0 }}
                transition={easeTransition(CLEAR_SECONDS)}
                // Wider than the field they sit under: constrained to it, the four of
                // them break 3 + 1 and strand "Surprise me" on a line of its own, which
                // reads as an afterthought rather than as one of the four ways in.
                className="flex flex-wrap justify-center gap-2 lg:-mx-16"
              >
                {openers.map((opener, index) => (
                  <QuickReplyChip
                    key={opener}
                    label={opener}
                    index={index}
                    onClick={() => start(opener)}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
