'use client';

import { Markdown } from '@/components/ui/markdown';
import { RouteWait } from '@/components/ui/route-wait';
import { messageText } from '@/features/agent/message-text';
import type { WayfareUIMessage } from '@/features/agent/messages';
import { planBands } from '@/features/itinerary/bands';
import { ItineraryRevision } from '@/features/itinerary/itinerary-revision';
import { looksLikeItinerary } from '@/features/itinerary/parse';
import { planProse } from '@/features/itinerary/prose';

import { ToolResult } from './tool-results';

type FollowUpReplyProps = {
  message: WayfareUIMessage;
  destination: string;
};

/**
 * One reply to something asked about the plan, drawn as whatever it turned out to be.
 *
 * Three shapes come through here and they are told apart by content, the way the stage
 * itself is: a plain answer is prose, a search is the same band of cards the document
 * draws, and a change to the trip is days.
 *
 * The searches used to be lifted out of the reply and appended to the document instead,
 * which put the answer and the fares it was about a full screen apart — the paragraph
 * saying what the flights mean for the trip sat here at the foot of the page while the
 * fares themselves were drawn up beside the stays, under a heading the traveller had
 * scrolled past twenty seconds ago. They belong to the question that produced them.
 */
function FollowUpReply({ message, destination }: FollowUpReplyProps) {
  // Anything said before the searches finished is the model narrating them, and is
  // dropped here for the same reason it is dropped in the document.
  const text = planProse(message.parts);
  // Deduplicated within the one reply: the model prices a trip, settles on a different
  // stay and prices it again, and two totals a screen apart are worse than either.
  const bands = planBands(message.parts);

  return (
    <div className="space-y-7">
      {bands.map((part) => (
        <ToolResult key={part.toolCallId} part={part} />
      ))}

      {text &&
        (looksLikeItinerary(text) ? (
          <ItineraryRevision text={text} destination={destination} />
        ) : (
          <Markdown content={text} />
        ))}
    </div>
  );
}

type FollowUpThreadProps = {
  /** Everything said after the plan. Empty until the traveller asks for a change. */
  messages: readonly WayfareUIMessage[];
  /** Names the destination for the photo lookup on any day rewritten here. */
  destination: string;
  /** A message has been sent and nothing has come back yet. */
  awaiting: boolean;
};

/**
 * The conversation about a finished plan.
 *
 * The one place a back-and-forth survives, because here it genuinely is one: the
 * document has been delivered and what follows is questions about it, changes to it,
 * and the fares and days those produce. Drawn as marginalia rather than as chat — the
 * traveller's line indented behind a rule, the answer set in the document's own body
 * copy at full measure.
 *
 * No bubbles, no avatars and no sides. Two voices are already told apart by the rule:
 * one of them is quoted and the other is the page.
 *
 * It only grows. Nothing written here is ever replaced by anything written later, so a
 * trip that has been adjusted four times reads as the plan and then the four changes,
 * which is the order they happened in and the only order that explains the last one.
 */
export function FollowUpThread({ messages, destination, awaiting }: FollowUpThreadProps) {
  // Nothing said since the plan means no section, whatever the conversation is doing.
  // Keying this on the wait as well put the heading and a route on screen underneath a
  // plan that had not started being written — the turn in flight was the plan itself,
  // and the document has its own wait for that.
  if (messages.length === 0) return null;

  return (
    <section className="space-y-7">
      <h2 className="section-rule text-ink-soft">Since then</h2>

      <div className="space-y-9">
        {messages.map((message) =>
          message.role === 'user' ? (
            <p
              key={message.id}
              className="border-l border-ink/25 pl-4 text-[0.9375rem] leading-relaxed text-ink"
            >
              <span className="sr-only">You asked: </span>
              <span className="whitespace-pre-wrap">{messageText(message)}</span>
            </p>
          ) : (
            <FollowUpReply key={message.id} message={message} destination={destination} />
          ),
        )}

        {awaiting && <RouteWait label="Looking at that" />}
      </div>
    </section>
  );
}
