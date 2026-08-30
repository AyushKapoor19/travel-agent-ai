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
       * Everything the document draws: the reply that wrote the plan, plus the tool
       * results of anything asked since.
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
 * The reply the document is drawn from: the newest one at or before the plan that
 * actually wrote days.
 *
 * This is the difference between adding to a trip and replacing it. Asking "what would
 * the flights cost" sends a planning turn that calls a tool and answers in a paragraph,
 * and a paragraph is not an itinerary — but it was recognised as one on the strength of
 * the tool call alone, so it took the document's place and the seven days the traveller
 * had just been given went off the screen. Everything they could ask that touches a
 * provider did this: price it again, find a cheaper room, check the weather.
 *
 * Falls back to the plan itself when nothing has written days yet, which is the first
 * planning turn and the shortlist — a shortlist has no days by design.
 */
function documentIndex(messages: readonly WayfareUIMessage[], plan: number): number {
  for (let index = plan; index >= 0; index -= 1) {
    const message = messages[index];
    if (message && wroteDays(message)) return index;
  }

  return plan;
}

/**
 * The tool results of every reply after the document, which join it as bands.
 *
 * Only the tool parts, because the prose of a follow-up belongs to the conversation
 * about the plan rather than to the plan: it is an answer to what they just asked, and
 * read into the document it would print as a second opening paragraph.
 *
 * The bands themselves are deduplicated downstream, so a second total supersedes the
 * first in place rather than printing two totals a screen apart.
 */
function bandsAfter(messages: readonly WayfareUIMessage[], document: number): WayfareMessagePart[] {
  return messages
    .slice(document + 1)
    .filter((message) => message.role === 'assistant')
    .flatMap((message) => message.parts.filter((part) => isToolUIPart(part)));
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
 * Searches from the end, so a traveller who asks for a different city gets the new
 * itinerary as the document and the old one as part of the conversation about it,
 * rather than two documents stacked up. A new itinerary takes over once it has written
 * a day; until then the plan on screen is still the one they can read.
 *
 * The phase is only reached when nothing in the transcript is a plan yet, which is
 * exactly the case it exists for: the first planning turn, where the layout has to
 * change before there is any content to change it on.
 */
export function readStage(messages: readonly WayfareUIMessage[], planning: boolean): Stage {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || !isPlan(message)) continue;

    const document = documentIndex(messages, index);

    return {
      kind: StageKind.PLAN,
      parts: [...(messages[document]?.parts ?? []), ...bandsAfter(messages, document)],
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
