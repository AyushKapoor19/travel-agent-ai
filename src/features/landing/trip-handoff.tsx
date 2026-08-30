'use client';

import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { AnimatePresence, motion } from 'motion/react';

import { SiteHeader } from '@/components/ui/site-header';
import { setPendingMessage } from '@/features/trip/handoff';
import { ease } from '@/lib/design/motion';

/**
 * How long the landing page has to get out of the way before the route changes.
 *
 * Short enough that the press still feels answered instantly, long enough that the
 * screen is visibly leaving rather than gone. It is spent on a page that is already
 * dissolving, and /chat is prefetched, so it is not latency added to the trip: the
 * request the conversation opens with could not have been sent any earlier anyway.
 *
 * A hair longer than the dissolve and no more. Everything past the dissolve is spent on
 * an empty screen, and the empty screen is also what the conversation paints onto before
 * its first question rises — so time banked here is spent twice.
 */
const HANDOVER_MS = 300;

/** The dissolve, in seconds, matched to `HANDOVER_MS`. */
const DISSOLVE_SECONDS = 0.26;

type TripHandoff = {
  /** Opens /chat with a first message. Ignored once one is already on its way. */
  start: (text: string) => void;
  /** Opens /chat with nothing said yet, for the ways in that are not a sentence. */
  open: () => void;
  /** A trip has been started and the page is handing over. */
  leaving: boolean;
};

const Context = createContext<TripHandoff | null>(null);

export function useTripHandoff(): TripHandoff {
  const handoff = useContext(Context);
  if (!handoff) throw new Error('useTripHandoff must be used inside TripHandoffProvider');
  return handoff;
}

/**
 * The seam between the landing page and the conversation.
 *
 * Two routes, and the whole job here is to stop them reading as two websites. Three
 * things do that, and none of them is a page transition in the usual sense:
 *
 * The backdrop never moves. It is mounted in the root layout, so its washes drift
 * through the navigation on one continuous timeline — the paper the chat is written on
 * has been behind the landing page the entire time, under the black. Handing over is
 * therefore a matter of taking the black away rather than of painting anything new.
 *
 * The wordmark never moves. `SiteHeader` is the same row on both routes, and the frame
 * below is that row again — drawn here, in paper's ink, while the night one dissolves
 * underneath it. Across the cut the only header that changes is its colour, and the orb
 * lights on the press and stays lit into the first reply.
 *
 * And the screen leaves the way a question does. The copy lifts and fades, exactly as an
 * answered question does inside the conversation, so the first thing that happens on the
 * landing page is the thing that happens six more times after it.
 */
export function TripHandoffProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  // Warm before it is wanted. The hand-off is deliberately brief, and it is the one
  // navigation on the site that must not end on an empty frame while a chunk loads.
  useEffect(() => {
    router.prefetch('/chat');
  }, [router]);

  const open = useCallback(() => {
    if (leaving) return;

    setLeaving(true);
    window.setTimeout(() => router.push('/chat'), HANDOVER_MS);
  }, [leaving, router]);

  const start = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      // `leaving` is checked here as well as in `open`, so a second press cannot rewrite
      // the message that is already on its way.
      if (!trimmed || leaving) return;

      setPendingMessage(trimmed);
      open();
    },
    [leaving, open],
  );

  return (
    <Context.Provider value={{ start, open, leaving }}>
      {/* Fades the panels off the black they are painted on, uncovering the backdrop
          that has been under them since the page loaded. A class on an ancestor rather
          than a prop on `Panel`, because which panel is leaving is not a panel's
          business — the whole page is. */}
      <div data-handoff={leaving ? '' : undefined}>{children}</div>

      <AnimatePresence>
        {leaving && (
          <motion.div
            key="frame"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={ease(DISSOLVE_SECONDS)}
            // Above the panels and below nothing: this is the next page's chrome,
            // arriving early. Inert and hidden, because a second wordmark that can be
            // tabbed to or announced is scenery pretending to be furniture.
            className="pointer-events-none fixed inset-0 z-50 flex flex-col"
            inert
            aria-hidden
          >
            <SiteHeader active rule />
          </motion.div>
        )}
      </AnimatePresence>
    </Context.Provider>
  );
}
