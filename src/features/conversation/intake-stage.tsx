'use client';

import { AnimatePresence, motion } from 'motion/react';

import { AnswerField } from '@/components/ui/answer-field';
import { FieldRail } from '@/components/ui/field-rail';
import { Markdown } from '@/components/ui/markdown';
import { RouteWait } from '@/components/ui/route-wait';
import { FLOW_STEPS } from '@/features/trip/flow';
import { tripStub } from '@/features/trip/stub';
import { ease } from '@/lib/design/motion';

import { AnswerRejected } from './answer-rejected';
import { ChatError } from './chat-error';
import { QuickReplies } from './quick-replies';
import type { Conversation } from './use-conversation';

const PLACEHOLDER = 'Answer in your own words…';
const HINT = 'Enter to send · Shift + Enter for a new line';

/** How far the answered question recedes while the next one is being written. */
const DIMMED_OPACITY = 0.32;

/**
 * The handover between two questions.
 *
 * One leaves upward and the next arrives from below, which is the only part of this
 * that is a decision: a question that has been answered is behind you and the next one
 * is ahead, so they travel the way the form does. Small, because the distance is the
 * difference between a page turning and a page being shoved.
 *
 * The old question leaves faster than the new one lands. Both at the same speed reads
 * as a swap; a quick exit and an unhurried arrival reads as the screen having moved on.
 */
const ASK_RISE_PX = 14;
const ASK_LEAVE_SECONDS = 0.24;
const ASK_ARRIVE_SECONDS = 0.55;

/**
 * The opening question, which arrives at a different pace to the six after it.
 *
 * An unhurried arrival is right when there is a question already on screen being
 * replaced. It is wrong for the first one: nothing is on screen yet, and half a second
 * of fading up from nothing is half a second of blank page — most of it on the way in
 * from the landing page, where the traveller has already pressed send and is waiting for
 * something to look at.
 */
const ASK_OPEN_SECONDS = 0.26;

/** Which transient thing is under the answer line, and the key its swap turns on. */
const Transient = {
  ERROR: 'error',
  WAIT: 'wait',
  /** Their answer came back unread, with the suggestions still under it. */
  REJECTED: 'rejected',
  CHIPS: 'chips',
  NONE: 'none',
} as const;

type IntakeStageProps = {
  conversation: Conversation;
  /** The question as the agent phrased it, or empty before the first reply lands. */
  prompt: string;
  /** The reply it came from, which is what tells one question from the next. */
  promptId: string | null;
};

/**
 * The questions, as a form rather than as a conversation.
 *
 * One question at a time, set at display size, with the line it gets answered on
 * directly underneath and the ticket filling in at the foot of the screen. What it
 * replaced was a transcript: alternating bubbles that pushed the current question to
 * the middle of a scroll region and left two thirds of the screen empty, which is
 * both the layout of every chat product and — on a screen with three short messages
 * on it — mostly nothing.
 *
 * Nothing is lost by dropping the history, because the history of an intake is a list
 * of answers and the stub is a better index of those than a transcript: seven labelled
 * fields, in the order they were asked, showing what was understood rather than what
 * was typed.
 *
 * The one thing a transcript did carry is the sense that the last answer landed. That
 * is now three smaller signals in one direction of travel: the question receding while
 * the reply is read, then leaving upward as the next one arrives from below, and the
 * cell it filled fading in underneath. Around all of it the answer line does not move,
 * because a form whose field jumps between questions is one the traveller has to find
 * again each time.
 */
export function IntakeStage({ conversation, prompt, promptId }: IntakeStageProps) {
  const { brief, currentStep, busy, awaitingReply, error, rejection, input, picked } = conversation;

  // The canned question stands in until the agent's own phrasing arrives, which is the
  // opening turn: there is nothing to extract from an empty conversation, so asking the
  // model to word the first question would only be latency.
  //
  // The opening question rather than the current step's, and the difference shows on the
  // way in from the landing page. There, the first question has already been answered,
  // so the brief lands before the reply does and the current step is the second one —
  // which would put a question on screen that nobody has been asked yet, swap it for the
  // agent's wording of the same question a moment later, and read as two changes of mind.
  // Holding the answered question until there is something to replace it with makes this
  // arrival the same handover as every other: one question leaves, the next arrives.
  const question = prompt || FLOW_STEPS[0]?.question || '';

  const chips = currentStep?.chips ?? [];
  const offering = !busy && chips.length > 0;

  // Ahead of the chips and behind everything else. A refused answer is news about the
  // turn that just happened, where a request that failed outright and a reply still
  // being read are both news about the turn happening now.
  const transient = error
    ? Transient.ERROR
    : awaitingReply
      ? Transient.WAIT
      : rejection
        ? Transient.REJECTED
        : offering
          ? Transient.CHIPS
          : Transient.NONE;

  return (
    <div className="measure flex min-h-0 flex-1 flex-col">
      {/* Left-aligned inside the column rather than centred in it. The question and the
          line it is answered on share a left margin with the ticket below them, because
          two things stacked down one screen that start somewhere different read as two
          unrelated things. The narrower cap is because a question set at display size
          runs out of comfortable line length sooner than a paragraph does. */}
      <div className="flex w-full max-w-2xl flex-1 flex-col gap-9 py-10">
        {/* Keyed on the reply rather than on its text, so the question crosses over
            once when a new one begins and holds still while it is being written.

            Takes the slack above the answer line and hangs its text from the bottom of
            it, which is what keeps the field still while a long question wraps. */}
        <div className="ask-slot flex-1">
          {/* The first question arrives the same way the six after it do, rather than
              being there when the screen is. That is what makes the step in from the
              landing page a handover: its copy leaves upward as this rises to take the
              place. Quicker, and at full strength — see below. */}
          <AnimatePresence mode="wait">
            <motion.div
              key={promptId ?? 'opening'}
              // The opening question is already legible on the first paint and only
              // settles into place; a later one fades up as well, because it is replacing
              // something. Fading the first one in means the screen the traveller lands on
              // is briefly blank, and it is blank at the worst possible moment — the
              // landing page has just dissolved and there is nothing else on it yet.
              initial={{ opacity: promptId ? 0 : 1, y: ASK_RISE_PX }}
              // Receding is feedback for an answer, so it is only ever applied to a
              // question the agent asked. The opening one is the page's own heading until
              // there is a reply to replace it, and holding a heading at a third of its
              // ink while the first reply is written is a screen with nothing on it —
              // which is exactly the moment the traveller arrives from the landing page.
              animate={{ opacity: awaitingReply && promptId ? DIMMED_OPACITY : 1, y: 0 }}
              // The exit carries its own timing, so only the leaving is hurried. The
              // dimming in place — which is what happens while their answer is being
              // read — keeps the arrival's unhurried pace.
              exit={{ opacity: 0, y: -ASK_RISE_PX, transition: ease(ASK_LEAVE_SECONDS) }}
              transition={ease(promptId ? ASK_ARRIVE_SECONDS : ASK_OPEN_SECONDS)}
            >
              <Markdown content={question} variant="ask" />
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="shrink-0">
          <AnswerField
            value={input}
            onChange={conversation.setInput}
            onSubmit={() => conversation.send(input)}
            busy={busy}
            onStop={conversation.stop}
            placeholder={PLACEHOLDER}
            hint={HINT}
            // The moment a reply finishes is the moment there is a new question to
            // answer, and the caret belongs back on the line.
            focusKey={`${currentStep?.id ?? 'complete'}:${busy}`}
          />

          {/* One slot for everything transient about the turn, so the block above does
              not shift as they swap. Held at a minimum height for the same reason: a row
              of suggestions arriving is not a reason for the question to move up the
              screen.

              The failed turn goes here rather than at the foot of the page because that
              is what it is about — the answer on this line was not accepted, and
              nothing on the ticket below has changed. */}
          <div className="mt-7 min-h-9">
            <AnimatePresence initial={false} mode="wait">
              <motion.div
                key={transient}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: ease(ASK_LEAVE_SECONDS) }}
                transition={ease(ASK_ARRIVE_SECONDS)}
              >
                {error ? (
                  <ChatError message={error.message} onRetry={conversation.retry} />
                ) : awaitingReply ? (
                  <RouteWait label="Reading that" />
                ) : rejection ? (
                  // The one thing that stacks rather than replacing. Everywhere else
                  // here the chips are an alternative to what is on screen; under a
                  // refused answer they are the shortest way out of it, and hiding them
                  // would leave the traveller told to try again with nothing to try.
                  <div className="flex flex-col gap-4">
                    <AnswerRejected message={rejection.message} />
                    {offering && (
                      <QuickReplies
                        chips={chips}
                        multiSelect={currentStep?.multiSelect ?? false}
                        picked={picked}
                        onSend={conversation.send}
                        onToggle={conversation.toggle}
                        onSubmit={conversation.submitPicked}
                      />
                    )}
                  </div>
                ) : (
                  // Only once the reply has finished. Suggestions offered beside a
                  // question still being written are answers to a question nobody has
                  // read yet.
                  offering && (
                    <QuickReplies
                      chips={chips}
                      multiSelect={currentStep?.multiSelect ?? false}
                      picked={picked}
                      onSend={conversation.send}
                      onToggle={conversation.toggle}
                      onSubmit={conversation.submitPicked}
                    />
                  )
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Balances the slack the question takes above, so the pair straddles the middle
            of the screen instead of sitting at the foot of it. Shrinks first when the
            window is too short to hold all three, which is the right order: losing the
            breathing room below costs nothing, and losing a line of the question costs
            the question. */}
        <div aria-hidden className="min-h-0 flex-1" />
      </div>

      <FieldRail
        fields={tripStub(brief)}
        activeId={currentStep?.id ?? null}
        packOnMobile
        className="tear pb-1 pt-4"
      />
    </div>
  );
}
