'use client';

import { Markdown } from '@/components/ui/markdown';
import { RouteWait } from '@/components/ui/route-wait';
import { messageText } from '@/features/agent/message-text';
import type { WayfareUIMessage } from '@/features/agent/messages';

type FollowUpThreadProps = {
  /** Everything said after the plan. Empty until the traveller asks for a change. */
  messages: readonly WayfareUIMessage[];
  /** A message has been sent and nothing has come back yet. */
  awaiting: boolean;
};

/**
 * The conversation about a finished plan.
 *
 * The one place a back-and-forth survives, because here it genuinely is one: the
 * document has been delivered and what follows is questions about it. Drawn as
 * marginalia rather than as chat — the traveller's line indented behind a rule, the
 * answer set in the document's own body copy at full measure.
 *
 * No bubbles, no avatars and no sides. Two voices are already told apart by the rule:
 * one of them is quoted and the other is the page.
 */
export function FollowUpThread({ messages, awaiting }: FollowUpThreadProps) {
  // Nothing said since the plan means no section, whatever the conversation is doing.
  // Keying this on the wait as well put the heading and a route on screen underneath a
  // plan that had not started being written — the turn in flight was the plan itself,
  // and the document has its own wait for that.
  if (messages.length === 0) return null;

  return (
    <section className="space-y-7">
      <h2 className="section-rule text-ink-soft">Since then</h2>

      <div className="space-y-6">
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
            <Markdown key={message.id} content={messageText(message)} />
          ),
        )}

        {awaiting && <RouteWait label="Looking at that" />}
      </div>
    </section>
  );
}
