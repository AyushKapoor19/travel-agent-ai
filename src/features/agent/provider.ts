import 'server-only';

import { google } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';

/**
 * The only place in the app that names a model provider. Swapping to Claude or
 * OpenAI means changing the import and these two functions.
 *
 * Note on versions: `@ai-sdk/google` must stay on the v3 line. v4 implements a
 * newer language-model spec than `ai` v6 accepts and fails the build with
 * "Type 'BatchLanguageModelV4' is not assignable to type 'LanguageModel'".
 */

/** Reasoning-capable model for itinerary writing and tool use. */
const PLANNING_MODEL = 'gemini-3.6-flash';

/**
 * Lighter model for the guided questions and field extraction. These turns are
 * short and mechanical, and skipping the reasoning pass keeps them snappy —
 * the planning model spends 100+ thinking tokens even on a one-word reply.
 */
const CONVERSATION_MODEL = 'gemini-flash-lite-latest';

/**
 * Sampling. Low for the interview, where the job is to phrase one known question
 * and drifting off it is the only failure mode; a little higher for the itinerary,
 * which is the one turn that is meant to read as written rather than generated.
 */
export const CONVERSATION_TEMPERATURE = 0.6;
export const PLANNING_TEMPERATURE = 0.7;

/**
 * Tool-call rounds allowed in the planning turn.
 *
 * Required, and not just a safety bound: the default is one step, which ends the
 * run on the first tool call and never produces the itinerary. Eight leaves room
 * for a hotel search, two or three activity searches, and the prose.
 */
export const MAX_PLANNING_STEPS = 8;

export const API_KEY_ENV = 'GOOGLE_GENERATIVE_AI_API_KEY';

export function hasApiKey(): boolean {
  return Boolean(process.env[API_KEY_ENV]);
}

export function planningModel(): LanguageModel {
  return google(process.env.TRAVEL_AGENT_MODEL || PLANNING_MODEL);
}

export function conversationModel(): LanguageModel {
  return google(process.env.TRAVEL_AGENT_FAST_MODEL || CONVERSATION_MODEL);
}
