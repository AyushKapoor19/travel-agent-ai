import type { InferUITools, UIMessage } from 'ai';

import type { StepId, TripBrief } from '@/features/trip/brief';

import type { TravelTools } from './tools';

/** What the server decided this turn is: one more question, or the plan. */
export const TurnKind = {
  QUESTION: 'question',
  PLANNING: 'planning',
} as const;

export type TurnKind = (typeof TurnKind)[keyof typeof TurnKind];

/**
 * The server's decision about the turn, sent before the reply starts streaming.
 *
 * Worth sending rather than inferring: the client needs to know a planning turn
 * has begun in order to lay the reply out as an itinerary, and it needs to know
 * before the first token — which is exactly when guessing from content is
 * impossible.
 */
export type TurnPhase = {
  kind: TurnKind;
  /** The step being asked, or null on a planning turn. */
  stepId: StepId | null;
  destination: string;
};

/**
 * A reply the server would not accept, and the turn it ended.
 *
 * Sent instead of a question rather than alongside one, which is what makes it
 * different from every other signal here: on this turn the agent says nothing at
 * all. The step has not moved, the brief has not changed, and the question on
 * screen is still the one that was asked — so the only thing the client needs is
 * a sentence to put under the answer line and the identity of the step it belongs
 * to, in case the traveller has meanwhile got somewhere else.
 */
export type TurnRejection = {
  stepId: StepId;
  /** Already phrased for the traveller by the server; shown verbatim. */
  message: string;
};

/**
 * Out-of-band signals sent alongside the assistant's text. All are transient:
 * they are delivered to the client's onData handler and kept out of message
 * history, so the brief never gets replayed back through the model.
 */
export type WayfareDataParts = {
  brief: TripBrief;
  phase: TurnPhase;
  rejection: TurnRejection;
};

export type WayfareUIMessage = UIMessage<never, WayfareDataParts, InferUITools<TravelTools>>;

/** One part of a message: text, a tool call, or a transient data signal. */
export type WayfareMessagePart = WayfareUIMessage['parts'][number];
