'use client';

import { useEffect, useRef } from 'react';

import { AnswerField } from '@/components/ui/answer-field';
import { messageText } from '@/features/agent/message-text';
import type { WayfareMessagePart, WayfareUIMessage } from '@/features/agent/messages';
import { ItineraryDocument } from '@/features/itinerary/itinerary-document';

import { ChatError } from './chat-error';
import { FollowUpThread } from './follow-up-thread';
import type { Conversation } from './use-conversation';

const PLACEHOLDER = 'Change anything — swap a day, move the budget, add a stop…';

/**
 * How close to the foot of the document counts as reading the newest thing.
 *
 * Above this, a reply streaming in below is left to arrive on its own: someone who has
 * scrolled up to re-read Day 3 has said what they are looking at, and dragging them to
 * the bottom every few tokens is the single most irritating thing a streaming interface
 * can do.
 */
const FOLLOWING_PX = 220;

type PlanStageProps = {
  conversation: Conversation;
  /** What the document draws: the plan, plus anything priced since. Empty before it starts. */
  parts: readonly WayfareMessagePart[];
  followUps: WayfareUIMessage[];
};

/**
 * The finished trip, and the way to change it.
 *
 * A scrolling document with the field for adjustments held below it, separated by a
 * hairline rather than floated over the page in a glass bar. That distinction is the
 * reason the region scrolls internally instead of the page doing it: a bar that sits on
 * top of a document has to be opaque enough to hide the words passing under it, and
 * anything opaque enough for that is a chat composer again.
 */
export function PlanStage({ conversation, parts, followUps }: PlanStageProps) {
  const { brief, busy, error, input } = conversation;
  const region = useRef<HTMLDivElement>(null);
  const seen = useRef(0);

  // The plan itself is still arriving whenever nothing has been said since it.
  const writing = busy && followUps.length === 0;

  const count = followUps.length;
  const tail = followUps[count - 1];
  const tailLength = tail ? messageText(tail).length : 0;

  /*
   * A follow-up turn that is working but has nothing to show for it yet.
   *
   * The gap this closes is the whole of the reported bug. The thread used to be
   * handed `awaitingReply`, which is only true while the request is `submitted` —
   * so the wait vanished the instant the response *started*, and the traveller was
   * left with their own question, an empty page under it and a Stop button, which
   * reads as a hang rather than as work.
   *
   * Derived from the tail of the thread rather than from the status, because that
   * is the thing actually being looked at: their message still being the last one
   * means nothing has come back.
   *
   * Any part at all ends the wait, text or not. A turn that opens with a tool call
   * spends its first several seconds streaming nothing but the call, and that used
   * to count as empty — because the call was drawn up in the document, beside the
   * stays, rather than under the question that asked for it. It is drawn here now,
   * so the skeleton is the wait, and a route spinning directly above it is the same
   * wait twice.
   */
  const answering = busy && count > 0 && (tail?.role !== 'assistant' || tail.parts.length === 0);

  useEffect(() => {
    const element = region.current;
    if (!element || count === 0) return;

    const asked = count !== seen.current;
    seen.current = count;

    // A message the traveller just sent is always worth jumping to, wherever they were
    // reading. Its reply is only followed if they stayed to watch it.
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (!asked && distance > FOLLOWING_PX) return;

    element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
  }, [count, tailLength]);

  return (
    <>
      {/* The scroller is the full width of the window and the column is centred inside
          it. The wheel has to find something scrollable wherever it is over the page,
          and beside a centred document most of the page is margin.

          `relative` is load-bearing and not a layout tweak. `overflow` clips an
          absolutely positioned descendant only when the scroller is also its
          containing block, and without a `position` here it is not — so every
          `sr-only` span in the document, and `sr-only` is `position: absolute`,
          resolved against the page instead. Each one sat at its static position deep
          inside the scrolled content and stretched the *document* down to meet it, so
          a plan with a fares card and a dozen result cards in it made the window
          scrollable by a thousand pixels or more. What that looked like was the whole
          app sliding up and a screen of blank backdrop underneath, since the shell is
          exactly one viewport tall and there is nothing below it. */}
      <div ref={region} className="scroll-subtle relative min-h-0 flex-1 overflow-y-auto">
        <div className="measure space-y-14 py-9">
          <ItineraryDocument brief={brief} parts={parts} writing={writing} />
          <FollowUpThread
            messages={followUps}
            destination={brief.destination}
            awaiting={answering}
          />
        </div>
      </div>

      <div className="measure shrink-0">
        <div className="border-t border-line pb-4 pt-4">
          {error && <ChatError message={error.message} onRetry={conversation.retry} />}

          <AnswerField
            value={input}
            onChange={conversation.setInput}
            onSubmit={() => conversation.send(input)}
            busy={busy}
            onStop={conversation.stop}
            placeholder={PLACEHOLDER}
          />
        </div>
      </div>
    </>
  );
}
