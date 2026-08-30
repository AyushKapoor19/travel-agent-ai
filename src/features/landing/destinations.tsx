'use client';

import { LineReveal } from '@/components/motion/line-reveal';
import { useCurrentPanelId } from '@/components/panels/panel-scroller';
import { SiteHeader } from '@/components/ui/site-header';

import { DestinationIndex } from './destination-index';

type DestinationsProps = {
  /** The panel's id, so this section can tell whether it is the one on screen. */
  id: string;
};

/**
 * The middle screen: eight ways to start, and nothing to read.
 *
 * The hero asks where you want to go, and this is the page conceding that most
 * people do not know — so it answers its own question with cities rather than
 * with an explanation. There is no argument for the product here, because the
 * argument is the itinerary and nobody has one yet.
 *
 * Set as a spread rather than as a headline with something underneath it: the
 * question holds one side and the eight answers hold the other, which is the
 * only arrangement in which neither is decoration for the other. It also puts
 * the list where a reader's eye already is on a wide screen, instead of below
 * the fold of a panel that cannot scroll.
 *
 * The header is the hero's, at the hero's inset, which is the whole point of it:
 * the wordmark lands in exactly the place it was left, so arriving here reads as
 * somewhere else on the same site rather than as a new page. It takes its colour
 * from the tone tokens, so the paper surface inverts it to obsidian without
 * being asked, and it is deliberately not an `anime` child — fading in the one
 * element that is supposed to have held still would give the game away.
 */
export function Destinations({ id }: DestinationsProps) {
  const current = useCurrentPanelId();

  /**
   * Whether this is the panel being looked at. Everything that moves on its own
   * asks first, so nothing is animating off screen.
   *
   * Always true where the scroller declined the page: there are no panels to be
   * on then, and the answer has to be the one that leaves the section visible.
   */
  const live = current === null || current === id;

  return (
    <>
      <SiteHeader />

      {/* The header supplies the top inset, so the column only pads the gap
          under the wordmark and the clearance beneath the index. */}
      <div className="panel__body shell justify-center pb-[clamp(1.75rem,5.5vh,4rem)] pt-[clamp(1.5rem,4.5vh,3.25rem)]">
        {/* One hairline down the gutter, which is the whole of what makes this a
            spread rather than two things that happen to be side by side. The
            statement is centred against the index instead of against the panel,
            so the two halves share a horizon however long the question runs. */}
        <div className="grid gap-[clamp(1.75rem,4.5vh,3.5rem)] lg:grid-cols-[minmax(0,0.58fr)_minmax(0,1fr)] lg:gap-x-0">
          <div className="flex flex-col justify-center lg:pr-14 xl:pr-20">
            <p className="anime label text-ink-muted">Somewhere to start</p>

            <h2 className="anime display-panel mt-[clamp(0.75rem,1.8vh,1.25rem)] max-w-md text-ink">
              <LineReveal
                play={live}
                lines={[
                  'Not sure where',
                  <>
                    to go yet
                    <span className="text-accent">?</span>
                  </>,
                ]}
              />
            </h2>

            <p className="anime lede mt-[clamp(1rem,2.4vh,1.5rem)] max-w-[20rem] text-pretty text-ink-soft">
              Pick a city and I will open the conversation with it.
            </p>

            {/* The way out of the list, said once and quietly. Eight cities on a
                screen implies a menu, and the product takes a sentence about
                anywhere — leaving that unsaid here is the section overstating
                its own limits. */}
            <p className="anime mt-[clamp(0.875rem,2vh,1.25rem)] text-[0.9375rem] tracking-[-0.015em] text-ink-muted">
              Somewhere else in mind?{' '}
              <a href="#top" className="link-rule text-ink-soft hover:text-ink">
                Say it in your own words
              </a>
              .
            </p>
          </div>

          <DestinationIndex
            live={live}
            className="anime lg:border-l lg:border-line lg:pl-14 xl:pl-20"
          />
        </div>
      </div>
    </>
  );
}
