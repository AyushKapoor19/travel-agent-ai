'use client';

import Link from 'next/link';

import { motion } from 'motion/react';
import type { MouseEvent, PointerEvent, ReactNode } from 'react';

import { classNames } from '@/lib/class-names';

import { useMagneticPull } from './use-magnetic-pull';

const MotionLink = motion.create(Link);

type MagneticProps = {
  href: string;
  text: string;
  /** A trailing mark in the accent colour. */
  accent?: string;
  /** Accessible name, where the word and its mark do not read as one. */
  label?: string;
  className?: string;
  /** Applied to the inner span, which trails the anchor at half the pull. */
  textClassName?: string;
  strength?: number;
  target?: string;
  children?: ReactNode;
  onHoverStart?: () => void;
  onHoverEnd?: () => void;
  /**
   * Runs before the link does, and may take the navigation over with
   * `preventDefault`. It stays an anchor either way, so a middle click or a
   * cmd-click still opens the href the way the reader asked for.
   */
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
};

/** Pixels of lean at the far edge of the element, before the pull falls off. */
const DEFAULT_STRENGTH = 100;

/**
 * A link that leans toward the cursor.
 *
 * The lean itself is `useMagneticPull`, which the composer shares. What is left
 * here is the markup and one decision inside it: the label trails the shape it
 * sits in at half the pull, so the pair flexes rather than reading as one rigid
 * object being dragged around.
 */
export function Magnetic({
  href,
  text,
  accent,
  label,
  className,
  textClassName,
  strength = DEFAULT_STRENGTH,
  target,
  onHoverStart,
  onHoverEnd,
  onClick,
}: MagneticProps) {
  const { pull, drift, track, release } = useMagneticPull(strength);

  return (
    <MotionLink
      href={href}
      target={target}
      rel={target === '_blank' ? 'noopener noreferrer' : undefined}
      aria-label={label ?? `${text}${accent ?? ''}`}
      style={{ x: pull.x, y: pull.y }}
      className={classNames('inline-flex items-center justify-center', className)}
      onClick={onClick}
      onPointerMove={track}
      onPointerEnter={(event: PointerEvent<HTMLAnchorElement>) => {
        if (event.pointerType !== 'mouse') return;
        onHoverStart?.();
      }}
      onPointerLeave={(event: PointerEvent<HTMLAnchorElement>) => {
        release();
        if (event.pointerType !== 'mouse') return;
        onHoverEnd?.();
      }}
      onBlur={release}
    >
      <motion.span
        aria-hidden
        style={{ x: drift.x, y: drift.y }}
        className={classNames('inline-block whitespace-nowrap', textClassName)}
      >
        {text}
        {accent && <span className="text-accent">{accent}</span>}
      </motion.span>
    </MotionLink>
  );
}
