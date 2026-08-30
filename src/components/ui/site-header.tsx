import Link from 'next/link';

import type { ReactNode } from 'react';

import { classNames } from '@/lib/class-names';

import { Orb } from './orb';

/** Big enough to read as the agent rather than as a bullet before the wordmark. */
const ORB_SIZE = 34;

type SiteHeaderProps = {
  /** Lights the orb: a request in flight, or a hand-off on its way to one. */
  active?: boolean;
  /** Rules the header off from what is under it. For the working screens. */
  rule?: boolean;
  /** The right-hand end of the row — the counter, the way out of a conversation. */
  children?: ReactNode;
  className?: string;
};

/**
 * The wordmark, in the corner of every screen the product has.
 *
 * One component rather than one per surface, because this is the only thing a traveller
 * sees on both the landing page and inside a conversation, and it is what makes the
 * second feel like a continuation of the first rather than another site. Two headers
 * agreeing to within a few pixels would be worse than one that differs on purpose: the
 * wordmark would step sideways at exactly the moment the page changes, which is the one
 * moment anyone is watching it.
 *
 * So the row is identical on the landing, in the chat, and in the frame the hand-off
 * draws in between — the same inset, the same orb, the same gap. What differs is what
 * hangs off the right of it and whether it is ruled off, and neither of those moves the
 * name.
 */
export function SiteHeader({ active = false, rule = false, children, className }: SiteHeaderProps) {
  return (
    <header
      className={classNames(
        'relative z-20 shrink-0',
        // The rule runs the width of the window while the row inside it sits in the
        // page's gutter, so the wordmark is in the corner of the page rather than in
        // the corner of the column below it.
        rule && 'border-b border-line',
        className,
      )}
    >
      <div className="shell flex items-center justify-between gap-4 pb-3.5 pt-[calc(0.875rem+env(safe-area-inset-top,0px))]">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-full"
          aria-label="Wayfare, home"
        >
          <Orb size={ORB_SIZE} active={active} />
          <span className="text-[0.9375rem] font-semibold tracking-[-0.03em] text-ink">
            Wayfare
          </span>
        </Link>

        {children}
      </div>
    </header>
  );
}
