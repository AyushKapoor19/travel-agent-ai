import { isToolUIPart } from 'ai';

import { textFromParts } from '@/features/agent/message-text';
import type { WayfareMessagePart, WayfareUIMessage } from '@/features/agent/messages';
import { looksLikeItinerary } from '@/features/itinerary/parse';

/**
 * Which of the two screens the conversation is on.
 *
 * This used to be decided per message, inside the component that drew one: each
 * assistant reply asked itself whether it was a chat bubble or the itinerary. That
 * works while the surface is a transcript, because a transcript is a list and every
 * item in it can answer for itself — and it stops working the moment the surface
 * stops being a list.
 *
 * The intake is not a list. It is one question, the line it gets answered on, and
 * the document filling in underneath; there is no earlier turn on screen for a
 * message to be an item of. So the decision moves up here and is made once for the
 * whole conversation.
 */

export const StageKind = {
  /** Still asking. One question on screen, and the stub underneath it. */
  INTAKE: 'intake',
  /** The plan exists, or is being written. The document owns the screen. */
  PLAN: 'plan',
} as const;

export type Stage =
  | {
      kind: typeof StageKind.INTAKE;
      /** The question as the agent phrased it. Empty before the first reply lands. */
      prompt: string;
      /**
       * The reply it came from, or null while the opening question is the canned one.
       *
       * Carried so the screen can tell one question from the next. The text alone
       * cannot: it arrives a token at a time, so the difference between "the question
       * changed" and "the question grew" is not in the string, and a transition driven
       * by the string would fire on every token.
       */
      promptId: string | null;
    }
  | {
      kind: typeof StageKind.PLAN;
      /**
       * What the document draws: the reply that wrote the plan, and only that reply.
       *
       * Empty when the planning turn has been sent and nothing has come back yet. The
       * document does not need them to start: the brief is complete by definition on a
       * planning turn, so the masthead can be drawn from the trip itself while the plan
       * inside it is still being written.
       */
      parts: readonly WayfareMessagePart[];
      /** Anything said after the plan: the traveller's adjustments and the replies. */
      followUps: WayfareUIMessage[];
    };

/**
 * Whether a message has proved itself a plan.
 *
 * Content only, and that is the point. A message with tool calls in it has priced
 * stays, and nothing but a planning turn does that; a message with day headings is a
 * plan whatever produced it.
 *
 * The turn's own phase is deliberately not consulted here, though it used to be.
 * Every turn after the intake is a planning turn — that is how the server is built —
 * so trusting the phase meant a one-line answer to "does Tuesday work?" was
 * classified as a plan, took the document's place with no days in it, and pushed the
 * real itinerary into the conversation below as raw prose. Content cannot make that
 * mistake: an adjustment that genuinely rebuilds the trip calls the tools again and
 * is recognised the moment it does.
 *
 * This decides which screen is on, and no more than that. Which reply the document is
 * drawn from is a separate question with a stricter answer — see `documentIndex`.
 */
function isPlan(message: WayfareUIMessage): boolean {
  if (message.role !== 'assistant') return false;
  if (message.parts.some(isToolUIPart)) return true;
  return looksLikeItinerary(textFromParts(message.parts));
}

/** Whether this reply wrote the day-by-day, which is what a document is made of. */
function wroteDays(message: WayfareUIMessage): boolean {
  if (message.role !== 'assistant') return false;
  return looksLikeItinerary(textFromParts(message.parts));
}

/**
 * The reply the document is drawn from: the *first* one that wrote days, and from then
 * on that one for good.
 *
 * The document is the plan as it was delivered, and it is permanent. It used to be the
 * newest reply with days in it, which made every change to the trip destructive — a
 * traveller who asked for Osaka instead got the Osaka days in place of the Tokyo ones
 * and lost the conversation that had produced them, because everything before the
 * document is off the screen by construction. What replaced it is append-only: the plan
 * stays where it was and every change to it is written underneath, in the order it was
 * asked for.
 *
 * The fallback is the newest plan rather than the oldest, and only applies while nothing
 * has written days at all. That is the shortlist — which has no days by design — and the
 * build that follows it, where the reply still streaming has to take the screen from a
 * shortlist that is no longer the answer to anything.
 */
function documentIndex(messages: readonly WayfareUIMessage[]): number {
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (message && wroteDays(message)) return index;
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message && isPlan(message)) return index;
  }

  return -1;
}

/** The index of the last assistant message, or -1. */
function newestAssistant(messages: readonly WayfareUIMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'assistant') return index;
  }
  return -1;
}

/**
 * Reads the whole conversation as one of the two screens.
 *
 * Nothing that has been on this screen ever leaves it. The plan is the document and
 * everything after it — the questions, the answers, the fares looked up since, a day
 * rewritten because they wanted the museum on Thursday — is the conversation below it,
 * in the order it happened.
 *
 * The phase is only reached when nothing in the transcript is a plan yet, which is
 * exactly the case it exists for: the first planning turn, where the layout has to
 * change before there is any content to change it on.
 */
export function readStage(messages: readonly WayfareUIMessage[], planning: boolean): Stage {
  const document = documentIndex(messages);

  if (document >= 0) {
    return {
      kind: StageKind.PLAN,
      parts: messages[document]?.parts ?? [],
      followUps: messages.slice(document + 1),
    };
  }

  if (planning) {
    // The reply being written, which is the last message only while it is the one
    // streaming. Anything else means the turn has been sent and not started.
    const last = messages[messages.length - 1];

    return {
      kind: StageKind.PLAN,
      parts: last?.role === 'assistant' ? last.parts : [],
      followUps: [],
    };
  }

  const newest = newestAssistant(messages);
  const asking = newest >= 0 ? messages[newest] : null;

  return {
    kind: StageKind.INTAKE,
    prompt: asking ? textFromParts(asking.parts) : '',
    promptId: asking?.id ?? null,
  };
}
