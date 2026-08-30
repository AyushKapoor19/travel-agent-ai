import { Panel } from '@/components/panels/panel';
import { type PanelMeta, PanelScroller } from '@/components/panels/panel-scroller';
import { Closing } from '@/features/landing/closing';
import { Destinations } from '@/features/landing/destinations';
import { Hero } from '@/features/landing/hero';
import { TripHandoffProvider } from '@/features/landing/trip-handoff';

/**
 * Night, paper, night — three screens rather than one long one.
 *
 * The page opens and closes on the same black surface, and the white spread in
 * between is where it stops talking and shows you somewhere to go, so arriving
 * at the end reads as coming back to where you started. A snap between panels
 * rather than a scroll through them is what makes that a journey instead of a
 * stack of blocks: each screen is composed as a whole and is never seen
 * half-finished.
 *
 * Declared here in one list, because the ids are also the anchors the page
 * links to and can be deep-linked by, and the two drifting apart is the only
 * way this page can lie to a reader.
 */
const PANELS: PanelMeta[] = [{ id: 'top' }, { id: 'destinations' }, { id: 'start' }];

export default function Home() {
  return (
    // Wrapped outside the scroller: every surface here can start a trip, and the frame
    // the page hands over to has to sit above all three panels rather than inside one.
    <TripHandoffProvider>
      <PanelScroller panels={PANELS}>
        <Panel id="top" tone="night" below="paper">
          <Hero />
        </Panel>

        <Panel id="destinations" tone="paper" above="night" below="night">
          <Destinations id="destinations" />
        </Panel>

        <Panel id="start" tone="night" above="paper">
          <Closing id="start" />
        </Panel>
      </PanelScroller>
    </TripHandoffProvider>
  );
}
