'use client';

import { motion } from 'motion/react';

import { cn } from '@/lib/cn';
import { ease } from '@/lib/design/motion';

/**
 * How firmly a field is held, which is the only thing the rail draws differently.
 *
 * Three weights of ink rather than three colours, and the order matters: something
 * said outranks a question waved off, which outranks one nobody has reached. A
 * reader scanning for what is left to do is reading exactly that ranking.
 */
export type RailTone = 'stated' | 'settled' | 'blank';

export type RailField = {
  id: string;
  label: string;
  /** Formatted for display, and never empty — a blank field says so with a dash. */
  value: string;
  tone: RailTone;
};

const TONE_CLASS: Record<RailTone, string> = {
  stated: 'text-ink',
  settled: 'text-ink-soft',
  blank: 'text-ink-muted',
};

type FieldRailProps = {
  fields: readonly RailField[];
  /** The field being asked about now, underscored so the rail says where you are. */
  activeId?: string | null;
  /**
   * Drops the fields nobody has reached on a narrow screen.
   *
   * Seven cells wrap to four rows on a phone, and on the intake three of those rows
   * are dashes — a third of the screen spent saying nothing. The finished plan turns
   * this off, because there it is drawing only the fields that came back anyway.
   */
  packOnMobile?: boolean;
  className?: string;
};

/**
 * The fields of a travel document, drawn as the row of cells they are printed in.
 *
 * This is the transcript's replacement, and it earns the swap by being a better
 * record than one: a bubble repeats what the traveller typed, while a cell shows
 * what was understood from it. "Somewhere warm in Japan in early April" comes back
 * as a destination, a climate and a window, and watching those three cells fill from
 * one sentence is the clearest evidence the agent is listening that this product can
 * give.
 *
 * Cells are sized to their contents rather than set in a grid. A ticket's fields are
 * not equal widths either, and seven equal columns gave a budget with a ceiling in it
 * ninety pixels while "Party" sat in the same ninety with the word "solo".
 */
export function FieldRail({
  fields,
  activeId = null,
  packOnMobile = false,
  className,
}: FieldRailProps) {
  return (
    <dl className={cn('flex flex-wrap gap-x-8 gap-y-3.5', className)}>
      {fields.map((field) => {
        const active = field.id === activeId;

        return (
          <div
            key={field.id}
            className={cn(
              // The rule under the active cell is the same rule the answer is being
              // typed on above it, which is what ties the question to the field it
              // fills. Transparent elsewhere rather than absent, so nothing shifts
              // when it moves on — and faded rather than switched, so the rail hands
              // over at the pace the question above it does.
              'min-w-[4.5rem] max-w-[11rem] border-b pb-1.5',
              'transition-colors duration-500 ease-wayfare',
              active ? 'border-ink' : 'border-transparent',
              packOnMobile && field.tone === 'blank' && !active && 'hidden sm:block',
            )}
          >
            {/* A step smaller than the value it names, which is the whole of the
                hierarchy in this cell: the answer is the content and the label is
                the annotation, and they are within a size of each other. */}
            <dt
              className={cn(
                'label text-[0.6875rem] transition-colors duration-500 ease-wayfare',
                active ? 'text-ink' : 'text-ink-muted',
              )}
            >
              {field.label}
            </dt>
            <dd
              title={field.value}
              className={cn(
                'mt-1 truncate text-[0.875rem] tracking-[-0.015em]',
                TONE_CLASS[field.tone],
              )}
            >
              {/* Keyed on the value so a cell filled by the last answer fades in
                  rather than swapping. Opacity only: a transform here would need an
                  inline-block, and an inline-block wider than the cell is the one
                  thing `truncate` cannot shorten. */}
              <motion.span
                key={field.value}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={ease(0.45)}
              >
                {field.value}
              </motion.span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
