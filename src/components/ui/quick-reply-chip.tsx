'use client';

import { motion } from 'motion/react';

import { classNames } from '@/lib/class-names';
import { easeTransition, stagger } from '@/lib/design/motion';

type QuickReplyChipProps = {
  label: string;
  onClick: () => void;
  selected?: boolean;
  disabled?: boolean;
  /** Position in the row revealed together, which sets the chip's turn. */
  index?: number;
};

/** Eased rather than sprung: a row of chips arriving on springs reads as jelly. */
const REVEAL_SECONDS = 0.7;
const RISE_PX = 10;

/** The press. Just enough to feel like the chip took the tap. */
const TAP_SCALE = 0.97;

/**
 * A suggestion is a hairline and a word. Unselected it is barely an object;
 * chosen, it takes the primary fill, so a picked answer carries the same weight
 * as having pressed the button.
 */
export function QuickReplyChip({
  label,
  onClick,
  selected = false,
  disabled = false,
  index = 0,
}: QuickReplyChipProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      initial={{ opacity: 0, y: RISE_PX }}
      animate={{ opacity: 1, y: 0 }}
      transition={easeTransition(REVEAL_SECONDS, stagger(index))}
      whileTap={disabled ? undefined : { scale: TAP_SCALE }}
      className={classNames(
        'rounded-full border px-3.5 py-1.5 text-[0.8125rem] tracking-[-0.01em]',
        selected ? 'chip-selected' : 'btn-ghost',
        disabled && 'cursor-not-allowed opacity-40',
      )}
    >
      {label}
    </motion.button>
  );
}
