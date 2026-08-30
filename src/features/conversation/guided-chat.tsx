'use client';

import { ChatHeader } from './chat-header';
import { IntakeStage } from './intake-stage';
import { PlanStage } from './plan-stage';
import { readStage, StageKind } from './stage';
import { useConversation } from './use-conversation';

/**
 * The planning screen.
 *
 * Assembly and one decision: which of the two stages the conversation is on. Everything
 * that looks like a decision inside them — which question is being asked, whether a
 * reply is the plan, what the brief now says — is made in `useConversation`, in
 * `readStage`, or on the server.
 *
 * The two stages are laid out differently on purpose, and the header and the small print
 * are the only things they share. Taking questions is a form: it fills one screen
 * exactly, it does not scroll, and the ticket at the foot of it stays in view because
 * watching it fill in is the point. Reading a plan is reading a document: it is as long
 * as the trip, so it scrolls, and the line for changing it waits underneath.
 *
 * Full width, with the header spanning it and everything that is read centred in a
 * `measure` inside it. Writing this as one centred column is the natural thing to do and
 * gets two things wrong: the wordmark ends up in the corner of the column rather than the
 * corner of the page, and the scrolling region is only as wide as the text, so a wheel
 * over the empty margin beside a plan finds nothing to scroll.
 */
export function GuidedChat() {
  const conversation = useConversation();
  const { messages, currentStep, busy, planning } = conversation;

  const stage = readStage(messages, planning);

  return (
    /* `relative overflow-hidden` is a backstop rather than a layout choice. Every
       child is either fixed-height chrome or the document region, which scrolls
       itself, so nothing here should ever need the *window* to scroll — and when
       something does anyway the whole app slides up and leaves a screen of blank
       backdrop, because the shell is exactly one viewport tall with nothing beneath
       it. The pair is deliberate: `overflow` alone does not clip an absolutely
       positioned descendant, so without `relative` the guard would not catch the one
       kind of element that has actually escaped. */
    <div className="relative flex h-dvh flex-col overflow-hidden">
      <ChatHeader
        busy={busy}
        stepIndex={conversation.stepIndex}
        showMeter={stage.kind === StageKind.INTAKE && currentStep !== null}
        showReset={messages.length > 0}
        onReset={conversation.reset}
      />

      {stage.kind === StageKind.PLAN ? (
        <PlanStage conversation={conversation} parts={stage.parts} followUps={stage.followUps} />
      ) : (
        <IntakeStage conversation={conversation} prompt={stage.prompt} promptId={stage.promptId} />
      )}

      <p className="measure shrink-0 pb-4 pt-3 text-center text-[0.6875rem] leading-relaxed text-ink-muted">
        Wayfare hands you off to the provider to book. Confirm prices and availability there.
      </p>
    </div>
  );
}
