'use client';

import { motion } from 'motion/react';

import { LineReveal } from '@/components/motion/line-reveal';
import { ScrollCue } from '@/components/panels/scroll-cue';
import { SiteHeader } from '@/components/ui/site-header';
import { ease } from '@/lib/design/motion';

import { Earth } from './earth/earth';
import { TripComposer } from './trip-composer';
import { useTripHandoff } from './trip-handoff';

const OPENERS = [
  'Five days in Lisbon',
  'Tokyo in cherry blossom season',
  'A week in Mexico City',
  'Surprise me',
];

/**
 * How the question leaves once it has been answered.
 *
 * The same distance and the same direction the conversation's questions travel, because
 * this is the first of them: answered copy lifts, the next question arrives from below.
 * Faster than one inside the conversation, since the page is dissolving underneath it
 * and nothing is waiting to read it.
 */
const LEAVE_PX = 16;
const LEAVE_SECONDS = 0.26;

/**
 * A question, a place to answer it, and the planet you are answering about.
 *
 * On night rather than paper, for one reason: the Blue Marble is a photograph of
 * a lit sphere in space, and putting it on white forces the page to fake a
 * horizon it does not have. On black the limb and the atmosphere are simply true,
 * and the type gets to be the only other thing in the frame.
 *
 * The three entrances play on mount, because this is the first panel and there is
 * nothing to wait for. The `anime` wrappers are for coming back to it: they are
 * plain elements with nothing else transforming them, which keeps the panel
 * scroller's arrival off the same `transform` these children animate.
 */
export function Hero() {
  const { leaving } = useTripHandoff();

  // The headline and the lede are what has been answered; the line they were answered on
  // stays until the panel takes it, so the sentence does not vanish out from under the
  // press that sent it.
  const answered = leaving ? { opacity: 0, y: -LEAVE_PX } : { opacity: 1, y: 0 };

  return (
    <>
      <SiteHeader />

      {/* The bottom padding is the globe's clearance. The disc is 82% of a band
          42vh tall, which puts its top edge at 38vh; stopping the copy at 46vh
          leaves the atmosphere a band of empty black to bloom into. */}
      <div className="shell relative z-20 flex flex-1 flex-col items-center justify-center pb-[38vh] pt-4 text-center sm:pb-[46vh]">
        {/* Balanced rather than nowrapped: the line only fits across one row down
            to about a 560px viewport, and below that a phone should get two even
            lines rather than a headline shrunk until it does fit. */}
        <h1 className="anime display-hero text-balance text-ink">
          {/* The leaving is a layer in, not on the `anime` element itself: the scroller
              writes that one's transform on the way back to this panel, and two engines
              on one `transform` is a headline that jumps. */}
          <motion.span animate={answered} transition={ease(LEAVE_SECONDS)} className="block">
            <LineReveal
              immediate
              delay={0.1}
              lines={[
                <>
                  Where do you want to go
                  <span className="text-accent">?</span>
                </>,
              ]}
            />
          </motion.span>
        </h1>

        <div className="anime">
          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={answered}
            transition={leaving ? ease(LEAVE_SECONDS) : ease(1, 0.36)}
            className="lede mt-6 max-w-lg text-pretty text-ink-soft sm:mt-7"
          >
            One conversation, a handful of questions, and a day-by-day itinerary built from real
            places you can actually book.
          </motion.p>
        </div>

        <div className="anime w-full max-w-xl">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={ease(1, 0.48)}
          >
            <TripComposer id="trip-opener" openers={OPENERS} className="mt-9 sm:mt-10" />
          </motion.div>
        </div>
      </div>

      <ScrollCue />
      <Earth />
    </>
  );
}
