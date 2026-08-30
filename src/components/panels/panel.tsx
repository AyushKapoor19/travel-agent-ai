'use client';

import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { SURFACE, type Tone } from '@/lib/design/tone';

import { usePanels } from './panel-scroller';

type SeamProps = {
  edge: 'top' | 'bottom';
  /** This panel's tone, which the dome is painted in. */
  self: Tone;
  /** The neighbouring panel's tone, which the strip behind the dome is painted in. */
  neighbour: Tone;
};

/** The strip that collapses on arrival, filled with the panel being left. */
function Seam({ edge, self, neighbour }: SeamProps) {
  return (
    <div aria-hidden className={cn('seam', `seam--${edge}`, SURFACE[neighbour])}>
      <div className={cn('seam__dome', SURFACE[self])} />
    </div>
  );
}

type PanelProps = {
  id: string;
  tone: Tone;
  /** Tone of the panel above. Omit for the first one: there is no seam to paint. */
  above?: Tone;
  /** Tone of the panel below. Omit for the last one. */
  below?: Tone;
  className?: string;
  children: ReactNode;
};

/**
 * One screen of the run.
 *
 * The tone is declared here and nowhere else: `data-tone` re-points the whole
 * palette for everything inside, so a panel's children never have to know which
 * surface they were dropped onto. Paper is the default and says nothing.
 *
 * While the scroller is engaged, every panel but the current one is `inert`.
 * A panel translated off the top of the window is still in the document, and
 * without this a tab press would send focus into it — at which point the browser
 * tries to scroll it into view and fights the track for control of the page.
 */
export function Panel({ id, tone, above, below, className, children }: PanelProps) {
  const { panels, index, engaged } = usePanels();
  const own = panels.findIndex((panel) => panel.id === id);
  const hidden = engaged && own >= 0 && own !== index;

  return (
    <section
      id={id}
      data-panel={id}
      data-tone={tone === 'night' ? 'night' : undefined}
      inert={hidden}
      className={cn('panel isolate', SURFACE[tone], tone === 'night' && 'grain', className)}
    >
      {above && <Seam edge="top" self={tone} neighbour={above} />}
      {children}
      {below && <Seam edge="bottom" self={tone} neighbour={below} />}
    </section>
  );
}
