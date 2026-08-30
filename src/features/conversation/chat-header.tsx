'use client';

import { SiteHeader } from '@/components/ui/site-header';
import { StepMeter } from '@/components/ui/step-meter';
import { FLOW_STEP_META } from '@/features/trip/flow';

type ChatHeaderProps = {
  /** Lights the orb while a request is in flight. */
  busy: boolean;
  stepIndex: number;
  /** Hidden before the first question and once the questions are done. */
  showMeter: boolean;
  /** Hidden until there is a conversation to discard. */
  showReset: boolean;
  onReset: () => void;
};

/**
 * The site header, with how far through the questions this is hung off the end of it.
 *
 * One row on every width, which the version with progress dots in it could not manage
 * — the dots and their label needed more room than a phone has beside a wordmark, so
 * they were rendered twice and dropped to a second row underneath. A two-figure counter
 * fits anywhere, and the field names it used to repeat are on the stub at the foot of
 * the screen where they belong.
 */
export function ChatHeader({ busy, stepIndex, showMeter, showReset, onReset }: ChatHeaderProps) {
  const step = FLOW_STEP_META[stepIndex];

  return (
    <SiteHeader active={busy} rule>
      <div className="flex items-center gap-4">
        {showMeter && <StepMeter index={stepIndex} total={FLOW_STEP_META.length} />}

        {showReset && (
          <button
            type="button"
            onClick={onReset}
            className="btn-ghost rounded-full px-3 py-1.5 text-xs font-medium"
          >
            New trip
          </button>
        )}

        {/* Spoken rather than drawn. The counter says how far through this is and the
            stub says which field is being asked for, and neither is any use to a reader
            who cannot see them sitting at opposite ends of the screen. */}
        <p className="sr-only" aria-live="polite">
          {step
            ? `Question ${stepIndex + 1} of ${FLOW_STEP_META.length}: ${step.label}`
            : 'Building your itinerary'}
        </p>
      </div>
    </SiteHeader>
  );
}
