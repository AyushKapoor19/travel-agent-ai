'use client';

import { QuickReplyChip } from '@/components/ui/quick-reply-chip';
import { cn } from '@/lib/cn';

type QuickRepliesProps = {
  chips: readonly string[];
  /** Chips accumulate and are sent together instead of one press submitting. */
  multiSelect: boolean;
  /** The accumulated picks, in press order. Empty unless `multiSelect`. */
  picked: string[];
  /** Sends a single chip as the whole answer. */
  onSend: (chip: string) => void;
  /** Adds or removes a chip from the accumulated set. */
  onToggle: (chip: string) => void;
  /** Sends the accumulated set. */
  onSubmit: () => void;
  className?: string;
};

/**
 * The suggested answers under the question.
 *
 * A single-select chip is the answer, so pressing it sends. A multi-select one is a
 * vote, and needs the explicit Continue — otherwise picking a second interest would
 * mean answering the question twice.
 *
 * Positioned by whoever renders it rather than carrying its own margin. It sits under
 * a ruled line on the intake and under a document on the finished plan, and those want
 * different distances.
 */
export function QuickReplies({
  chips,
  multiSelect,
  picked,
  onSend,
  onToggle,
  onSubmit,
  className,
}: QuickRepliesProps) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {chips.map((chip, index) => (
        <QuickReplyChip
          key={chip}
          label={chip}
          index={index}
          selected={multiSelect && picked.includes(chip)}
          onClick={() => (multiSelect ? onToggle(chip) : onSend(chip))}
        />
      ))}

      {multiSelect && picked.length > 0 && (
        <button
          type="button"
          onClick={onSubmit}
          className="btn-primary rounded-full px-3.5 py-1.5 text-sm font-medium tracking-[-0.01em]"
        >
          Continue ({picked.length})
        </button>
      )}
    </div>
  );
}
