'use client';

import { usePanels } from './panel-scroller';

/**
 * The one instruction the page gives.
 *
 * A snap-scrolling page has no scrollbar, so nothing else on screen admits that
 * there is more below. It is a button as well as a hint, because on a trackpad
 * the gesture is obvious and on a laptop keyboard it is not — which is also why
 * the arrow is set in a disc rather than left on its own: the disc is the part
 * that looks pressable, and it is the only reason there is a target here big
 * enough to aim at.
 *
 * Bottom right, where a reader looks last and nothing else on the panel is
 * competing — the header is opposite it and the globe is centred between them.
 * The label is spoken rather than drawn; at this size a word beside the disc is
 * the difference between a mark and a caption.
 */
type ScrollCueProps = {
  /** Spoken, not drawn: at this size a word beside the disc reads as a caption. */
  label?: string;
};

export function ScrollCue({ label = 'Go to the next screen' }: ScrollCueProps) {
  const { panels, index, goTo } = usePanels();
  if (index >= panels.length - 1) return null;

  return (
    <button
      type="button"
      onClick={() => goTo(index + 1)}
      aria-label={label}
      className="cue-orb absolute bottom-7 right-[var(--shell-gutter)] z-20 sm:bottom-9"
    >
      <svg aria-hidden viewBox="0 0 24 24" fill="none" className="h-4 w-4">
        <path
          d="M12 4.75v14.5M5.75 13l6.25 6.25L18.25 13"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
