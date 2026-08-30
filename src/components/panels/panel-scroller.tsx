'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import gsap from 'gsap';
import { CustomEase } from 'gsap/CustomEase';
import { Observer } from 'gsap/Observer';
import type { ReactNode } from 'react';

export type PanelMeta = {
  /** Also the element id, so `#id` links and deep links keep working. */
  id: string;
};

type PanelsApi = {
  panels: PanelMeta[];
  /** Index of the panel currently on screen. */
  index: number;
  /** True only while the discrete scroller is driving the page. */
  engaged: boolean;
  goTo: (target: number | string) => void;
};

const IDLE: PanelsApi = { panels: [], index: 0, engaged: false, goTo: () => {} };

const PanelsContext = createContext<PanelsApi>(IDLE);

/**
 * Where a panel is in the run, for anything that has to behave differently
 * depending on whether it is being looked at. Safe outside a scroller: it
 * reports a single, static first panel, which is what the fallback page is.
 */
export function usePanels(): PanelsApi {
  return useContext(PanelsContext);
}

/**
 * The id of the panel on screen, or null when the scroller is not driving.
 *
 * Null rather than the first panel's id, because the two cases call for
 * different answers and the caller is the only one that knows which: a headline
 * that reveals itself once should simply play on an ordinary page, while a fan
 * that replays its entrance on arrival needs an intersection to replay against.
 */
export function useCurrentPanelId(): string | null {
  const { panels, index, engaged } = usePanels();
  if (!engaged) return null;

  return panels[index]?.id ?? null;
}

/** Seconds for one panel change. Long enough to read as travel. */
const TRAVEL_SECONDS = 1.25;

/** How far a panel's content is held back before it settles, as a fraction of one. */
const LAG = 0.22;

/**
 * When the takeover is allowed at all: a window tall enough to hold a panel, and
 * a reader who has not asked for less motion. Either stopping being true reverts
 * it, which leaves the identical markup behind as an ordinary scrolling page.
 */
const MIN_ENGAGE_HEIGHT_PX = 600;
const ENGAGE_QUERY = `(min-height: ${MIN_ENGAGE_HEIGHT_PX}px) and (prefers-reduced-motion: no-preference)`;

/**
 * The arrival: a seam collapsing on the leading edge, then the content released
 * behind it.
 */
const Reveal = {
  SEAM_SECONDS: 1.2,
  /**
   * A hand's width on a laptop, a thumb's on a phone, as a fraction of the
   * panel. Wider than this and the dome flattens out into a straight edge.
   */
  SEAM_LIFT_WIDE: 0.16,
  SEAM_LIFT_NARROW: 0.09,
  NARROW_ABOVE_PX: 540,

  CONTENT_SECONDS: 1.05,
  CONTENT_DELAY_SECONDS: 0.12,
  /**
   * Reversed on the way back up, so the element nearest the edge the reader
   * arrived from is always the first to settle.
   */
  CONTENT_STAGGER_FORWARD: 0.085,
  CONTENT_STAGGER_BACK: -0.07,
} as const;

/** Pixels of wheel or swipe before a gesture counts as a vote for the next panel. */
const GESTURE_TOLERANCE_PX = 14;

/** Which way each key moves through the run. */
const KEY_STEP: Readonly<Record<string, number>> = {
  ArrowDown: 1,
  PageDown: 1,
  ArrowUp: -1,
  PageUp: -1,
};

/** Rotation reports pre-rotate dimensions often enough to be worth measuring twice. */
const ORIENTATION_SETTLE_MS = 300;

/**
 * Three screens on a track, moved one at a time.
 *
 * The wheel, a swipe and the arrow keys all resolve to the same thing — commit
 * to the next panel — rather than to a scroll offset, so there is no state in
 * which the reader is looking at the bottom half of one screen and the top half
 * of another. GSAP's Observer is what normalises the three inputs; everything
 * else here is the arithmetic of a single translate.
 *
 * The takeover is a decision, not an assumption. `gsap.matchMedia` only engages
 * it on a window tall enough to hold a panel and for a reader who has not asked
 * for less motion, and it reverts cleanly the moment either stops being true —
 * which leaves the identical markup behind as an ordinary scrolling page.
 */
type PanelScrollerProps = {
  /** The run, in order. The ids double as the anchors links point at. */
  panels: PanelMeta[];
  children: ReactNode;
};

export function PanelScroller({ panels, children }: PanelScrollerProps) {
  const rootRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const [index, setIndex] = useState(0);
  const [engaged, setEngaged] = useState(false);

  /**
   * The index the engine reads. Observer callbacks are registered once and
   * would otherwise close over whatever the index was at that moment; state is
   * only kept alongside so React can re-render the nav.
   */
  const indexRef = useRef(0);
  /** Set while engaged, torn down to a no-op when not. */
  const travelRef = useRef<(target: number) => void>(() => {});

  const count = panels.length;

  useEffect(() => {
    gsap.registerPlugin(Observer, CustomEase);

    // The product's one easing curve, in the form GSAP wants it. Identical to
    // `--ease-wayfare`, so a CSS transition that fires on arrival lands with
    // the travel rather than after it.
    const ease = CustomEase.create('panelTravel', 'M0,0 C0.52,0.01 0.16,1 1,1');

    const media = gsap.matchMedia();

    media.add(ENGAGE_QUERY, () => {
      const root = rootRef.current;
      const track = trackRef.current;
      if (!root || !track) return;

      const html = document.documentElement;
      const panelAt = (target: number) =>
        root.querySelectorAll<HTMLElement>('[data-panel]')[target];

      /**
       * The height every panel is cut to, and the distance the track moves per
       * change. Published as a custom property rather than left to `dvh` so that
       * the number CSS lays out against and the number the tween travels are the
       * same one — a panel a few pixels taller than the trip to it shows a strip
       * of the next one along its bottom edge.
       *
       * Tracked live, which is only safe because it is: the observer refuses
       * every scroll gesture and the document cannot scroll at all, so a mobile
       * address bar has nothing to collapse in response to and the mid-gesture
       * resize that would otherwise make this jump never happens.
       */
      let height = window.innerHeight;
      let width = window.innerWidth;

      const publish = () => html.style.setProperty('--panel-h', `${height}px`);

      html.dataset.panels = '';
      publish();

      // A shared or bookmarked `#destinations`. The hash cannot be honoured by
      // scrolling once the document is fixed, so it is read once here and
      // becomes the panel the run opens on.
      const linked = panels.findIndex((panel) => panel.id === window.location.hash.slice(1));
      if (linked > 0) {
        indexRef.current = linked;
        setIndex(linked);
      }

      gsap.set(track, { y: -indexRef.current * height });
      setEngaged(true);

      /** Input is refused mid-travel, or a held wheel would skip a panel. */
      let animating = false;

      /**
       * The arrival. The seam on the leading edge collapses, pulling this
       * panel's own surface up through the one being left, and the content is
       * released behind it — so the panel appears to be uncovered rather than
       * slid into place.
       */
      const reveal = (target: number, direction: number) => {
        const panel = panelAt(target);
        if (!panel) return;

        const forward = direction > 0;
        const seam = panel.querySelector(forward ? '.seam--top' : '.seam--bottom');

        if (seam) {
          const liftRatio =
            width > Reveal.NARROW_ABOVE_PX ? Reveal.SEAM_LIFT_WIDE : Reveal.SEAM_LIFT_NARROW;

          gsap.fromTo(
            seam,
            { height: Math.round(height * liftRatio) },
            { height: 0, duration: Reveal.SEAM_SECONDS, ease, overwrite: true },
          );
        }

        const risers = panel.querySelectorAll('.anime');
        if (risers.length) {
          const lag = Math.round(height * LAG) * (forward ? 1 : -1);
          gsap.fromTo(
            risers,
            { y: lag, opacity: 0 },
            {
              y: 0,
              opacity: 1,
              duration: Reveal.CONTENT_SECONDS,
              delay: Reveal.CONTENT_DELAY_SECONDS,
              stagger: forward ? Reveal.CONTENT_STAGGER_FORWARD : Reveal.CONTENT_STAGGER_BACK,
              ease,
              overwrite: true,
            },
          );
        }
      };

      const travel = (target: number) => {
        const next = gsap.utils.clamp(0, count - 1, target);
        if (animating || next === indexRef.current) return;

        const direction = next > indexRef.current ? 1 : -1;
        animating = true;
        indexRef.current = next;
        setIndex(next);

        gsap.to(track, {
          y: -next * height,
          duration: TRAVEL_SECONDS,
          ease,
          overwrite: true,
          onComplete: () => {
            animating = false;
          },
        });

        reveal(next, direction);
      };

      travelRef.current = travel;

      // `wheelSpeed: -1` is what makes a downward wheel read as `onUp`: the
      // content is what moves up. `lockAxis` keeps a gesture the reader meant
      // sideways — a trackpad swipe, a thumb drifting across a panel — from
      // also being a vote for the next screen.
      const observer = Observer.create({
        target: window,
        type: 'wheel,touch',
        wheelSpeed: -1,
        lockAxis: true,
        tolerance: GESTURE_TOLERANCE_PX,
        preventDefault: true,
        onUp: () => travel(indexRef.current + 1),
        onDown: () => travel(indexRef.current - 1),
      });

      const onKeyDown = (event: KeyboardEvent) => {
        if (event.metaKey || event.ctrlKey || event.altKey) return;

        // A text field and a tablist both need the arrow keys more than the
        // page does. Space is left alone entirely: it belongs to whichever
        // button happens to have focus.
        const from = event.target as HTMLElement | null;
        if (from?.closest('input, textarea, select, [contenteditable="true"], [data-panel-keys]')) {
          return;
        }

        const step = KEY_STEP[event.key];
        if (step !== undefined) {
          event.preventDefault();
          travel(indexRef.current + step);
          return;
        }

        if (event.key === 'Home' || event.key === 'End') {
          event.preventDefault();
          travel(event.key === 'Home' ? 0 : count - 1);
        }
      };

      /**
       * In-page links, which have no scroll left to do. Captured and stopped
       * before React sees the click, so the router never gets a chance to jump
       * to a hash the document cannot honour.
       */
      const onClick = (event: MouseEvent) => {
        const link = (event.target as HTMLElement | null)?.closest('a[href^="#"]');
        const id = link?.getAttribute('href')?.slice(1);
        if (!id) return;

        const target = panels.findIndex((panel) => panel.id === id);
        if (target < 0) return;

        event.preventDefault();
        event.stopPropagation();
        travel(target);
      };

      let queued = 0;

      const remeasure = () => {
        if (window.innerWidth === width && window.innerHeight === height) return;
        width = window.innerWidth;
        height = window.innerHeight;
        publish();
        // Cut in rather than tweened: a window being dragged is not a journey,
        // and an animation here would lag every frame of the drag.
        gsap.set(track, { y: -indexRef.current * height });
      };

      // Coalesced, because a window drag fires this on every frame and each one
      // would otherwise force two layout reads and a write.
      const onResize = () => {
        cancelAnimationFrame(queued);
        queued = requestAnimationFrame(remeasure);
      };

      const onOrientation = () => {
        remeasure();
        window.setTimeout(remeasure, ORIENTATION_SETTLE_MS);
      };

      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('resize', onResize);
      window.addEventListener('orientationchange', onOrientation);
      root.addEventListener('click', onClick, true);

      return () => {
        observer.kill();
        cancelAnimationFrame(queued);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('resize', onResize);
        window.removeEventListener('orientationchange', onOrientation);
        root.removeEventListener('click', onClick, true);

        // Everything the engine wrote, taken back off: the fallback page has to
        // be the markup as authored, not the markup as last animated.
        gsap.killTweensOf(track);
        gsap.set(track, { clearProps: 'y' });
        root.querySelectorAll<HTMLElement>('[data-panel]').forEach((panel) => {
          gsap.set(panel.querySelectorAll('.anime'), { clearProps: 'y,opacity' });
          gsap.set(panel.querySelectorAll('.seam'), { clearProps: 'height' });
        });

        delete html.dataset.panels;
        html.style.removeProperty('--panel-h');
        travelRef.current = () => {};
        setEngaged(false);
      };
    });

    return () => media.revert();
  }, [count, panels]);

  const goTo = useCallback(
    (target: number | string) => {
      const next =
        typeof target === 'number' ? target : panels.findIndex((panel) => panel.id === target);

      const panel = next < 0 ? undefined : panels[next];
      if (!panel) return;

      if (engaged) {
        travelRef.current(next);
        return;
      }

      // Not engaged: no engine to drive, so this is an ordinary anchor jump.
      document.getElementById(panel.id)?.scrollIntoView({ block: 'start' });
    },
    [engaged, panels],
  );

  return (
    <PanelsContext.Provider value={{ panels, index, engaged, goTo }}>
      <main ref={rootRef} className="panels">
        <div ref={trackRef} className="panels__track">
          {children}
        </div>
      </main>
    </PanelsContext.Provider>
  );
}
