'use client';

import { useEffect, useRef } from 'react';

import { motion } from 'motion/react';

import { classNames } from '@/lib/class-names';

/** Past this the field scrolls rather than growing, so the rule cannot walk off screen. */
const MAX_HEIGHT_PX = 132;

type AnswerFieldProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** Something is in flight, so the field is closed to further typing. */
  busy: boolean;
  /**
   * Turns the send into a stop while busy. Omit where there is nothing to interrupt —
   * a hand-off to another page is already gone, and offering to stop it would be a
   * button that either lies or goes back.
   */
  onStop?: () => void;
  placeholder: string;
  /** Distinct per field, for the label. Two of these on one screen would collide. */
  id?: string;
  /**
   * Changes when a new question is asked, which is what moves the caret back to the
   * field.
   *
   * Passed rather than handled inside, because the field cannot tell a new question
   * from a re-render — and a component that refocuses itself on every render takes
   * the caret away from anyone who clicked somewhere else.
   */
  focusKey?: string;
  /** Written under the rule on the intake, where the field is the whole interface. */
  hint?: string;
  className?: string;
};

/**
 * The line an answer is written on. The only text field the product has.
 *
 * A rule and a caret, where there used to be a bordered panel with a send button in
 * it. The panel was a chat composer, and a chat composer is the single most
 * load-bearing signal that a page is a chat: it sits at the foot of the screen, it is
 * a box, and everything above it is therefore a transcript. Taking the box away and
 * leaving the line turns the same interaction into filling something in.
 *
 * The landing page's opener is this same field, and not a lookalike. A visitor types
 * their trip into a line on a black screen and then answers six more questions on a
 * white one, and if the second line were a different control at a different size the
 * two screens would read as two products that happen to share a wordmark.
 *
 * Enter still sends and Shift+Enter still breaks the line, because that convention is
 * older than chat and every text field on the web has trained it. The field is still
 * a textarea that grows for the same reason it always was: an answer to "anything else
 * I should know" is often three lines.
 */
export function AnswerField({
  value,
  onChange,
  onSubmit,
  busy,
  onStop,
  placeholder,
  id = 'answer',
  focusKey,
  hint,
  className,
}: AnswerFieldProps) {
  const field = useRef<HTMLTextAreaElement>(null);
  const armed = value.trim().length > 0;

  // Grown to its content rather than scrolled, so the rule always sits directly under
  // the last line of the answer. Measured from `scrollHeight`, which needs the height
  // released first or it only ever reports the height it already has.
  useEffect(() => {
    const element = field.current;
    if (!element) return;

    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [value]);

  useEffect(() => {
    if (focusKey === undefined) return;

    // Only where there is a pointer to have moved away from. On a phone, focusing the
    // field opens the keyboard over the ticket the traveller is reading, and does it
    // again after every single answer.
    if (!window.matchMedia('(pointer: fine)').matches) return;

    field.current?.focus();
  }, [focusKey]);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className={className}
    >
      <div className="field-rule flex items-end gap-4 pb-2.5">
        <label htmlFor={id} className="sr-only">
          Your answer
        </label>

        <textarea
          id={id}
          ref={field}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.shiftKey) return;
            event.preventDefault();
            onSubmit();
          }}
          rows={1}
          placeholder={placeholder}
          // The rule is the focus indicator: it goes to full ink on focus-within,
          // which is a wider and calmer signal than a ring drawn around a line the
          // width of the measure.
          className="min-w-0 flex-1 resize-none bg-transparent text-[1.0625rem] leading-relaxed tracking-[-0.011em] text-ink outline-none placeholder:text-ink-muted"
        />

        {busy && onStop ? (
          <button
            type="button"
            onClick={onStop}
            className="btn-ghost shrink-0 rounded-full px-3.5 py-1.5 text-[0.8125rem]"
          >
            Stop
          </button>
        ) : (
          <motion.button
            type="submit"
            disabled={!armed || busy}
            whileTap={{ scale: 0.94 }}
            className={classNames(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-[0.9375rem]',
              // Hairline until there is something to send, then the full fill: not
              // "you cannot", just "not yet". Stays filled through a hand-off, which
              // leaves the field empty but the trip very much underway.
              armed || busy ? 'btn-primary border-transparent' : 'border-line text-ink-muted',
            )}
          >
            <span aria-hidden>→</span>
            <span className="sr-only">Send</span>
          </motion.button>
        )}
      </div>

      {hint && <p className="mt-2.5 text-[0.75rem] text-ink-muted">{hint}</p>}
    </form>
  );
}
