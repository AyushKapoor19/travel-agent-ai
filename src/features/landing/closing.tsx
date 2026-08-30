'use client';

import { useEffect, useRef, useState } from 'react';

import { useInView } from 'motion/react';

import { Magnetic } from '@/components/motion/magnetic';
import { useCurrentPanelId, usePanels } from '@/components/panels/panel-scroller';
import { LiquidGlassFilters } from '@/components/ui/liquid-glass-filters';

import { FlagField } from './flags/flag-field';
import { useTripHandoff } from './trip-handoff';

/**
 * How early the expensive material is built, on each of the two page modes.
 *
 * Reaching the middle panel is the signal under the scroller; on the natively
 * scrolling fallback it is a wide intersection margin, which is roughly a
 * screen's worth of warning.
 */
const BUILD_FROM_PANEL = 1;
const BUILD_MARGIN = '700px';

/** Inset enough that the fan replays only once the section is properly arrived at. */
const SHOWING_MARGIN = '-15%';

/**
 * The page closes on one button.
 *
 * Everything above this has been an argument; there is nothing left to explain
 * and no reason to put a second text field in front of someone who has already
 * decided. So the whole viewport becomes the target — a sphere of glass over a
 * field of flags, which is the only place on the page the product's actual
 * subject, the number of countries it will plan for, is stated at all.
 */
type ClosingProps = {
  /** The panel's id, so this section can tell whether it is the one on screen. */
  id: string;
};

export function Closing({ id }: ClosingProps) {
  const { open } = useTripHandoff();
  const [spread, setSpread] = useState(false);

  /**
   * The material here is the most expensive on the site — twenty-odd live
   * backdrop filters, a displacement filter, and a blurred wash on a permanent
   * animation — and it sits at the end of a page that opens on a WebGL globe.
   * None of it is built until the reader has committed to the run.
   *
   * Under the panel scroller that is a panel index rather than an intersection:
   * a panel two screens down is off the bottom of a window that never scrolls,
   * so the observer has nothing useful to say until the travel that reveals it
   * has already begun. Reaching the middle screen is both earlier and certain.
   * The observer is still the answer on the natively-scrolling fallback.
   */
  const sectionRef = useRef<HTMLDivElement>(null);
  const near = useInView(sectionRef, { once: true, margin: BUILD_MARGIN });
  const { index, engaged } = usePanels();
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (engaged ? index >= BUILD_FROM_PANEL : near) setLive(true);
  }, [engaged, index, near]);

  /**
   * Whether this is the screen being looked at, which the flag field replays
   * its entrance from. Latching it, the way `live` latches, would mean the fan
   * only ever happens once — and the one thing worth coming back down here for
   * is watching it happen.
   *
   * Not once, and not the panel index either when the scroller is not driving:
   * the fallback is an ordinary page, where this is simply a section that can
   * be scrolled away from and back to.
   */
  const onScreen = useInView(sectionRef, { margin: SHOWING_MARGIN });
  const current = useCurrentPanelId();
  const showing = current === null ? onScreen : current === id;

  return (
    <div
      ref={sectionRef}
      data-live={live ? '' : undefined}
      className="relative flex flex-1 flex-col items-center justify-center"
    >
      {live && (
        <>
          <LiquidGlassFilters />

          {/* Glass with nothing behind it is grey. This is the light the button
              and the tiles spend the rest of their existence bending. */}
          <div aria-hidden className="ready-ambient z-0" />

          <FlagField spread={spread} showing={showing} />
        </>
      )}

      <Magnetic
        href="/chat"
        text="Ready"
        accent="?"
        label="Start planning a trip"
        className="ready-orb z-[2]"
        onHoverStart={() => setSpread(true)}
        onHoverEnd={() => setSpread(false)}
        // Through the hand-off rather than straight at the route, so the last screen
        // dissolves into the conversation the way the first one does. Still an anchor:
        // anything but a plain left click is left to the browser.
        onClick={(event) => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
          event.preventDefault();
          open();
        }}
      />
    </div>
  );
}
