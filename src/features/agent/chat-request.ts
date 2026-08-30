import 'server-only';

import type { UIMessage } from 'ai';

import type { TripBrief } from '@/features/trip/brief';
import { tripBriefSchema } from '@/features/trip/brief';
import { HttpStatus } from '@/lib/http';

/**
 * Validating what the client posted, before any of it reaches a model.
 *
 * Split out of the route so the route reads as the three decisions it makes and
 * not as five nested rejections. The result is a discriminated union rather than
 * a throw, because every failure here has its own status code and the caller has
 * to pick one.
 */

export type ChatRequest = {
  messages: UIMessage[];
  brief: TripBrief;
};

export type ChatRequestResult =
  { ok: true; request: ChatRequest } | { ok: false; status: number; message: string };

/**
 * What one request is allowed to carry.
 *
 * Both are generous on purpose. The longest honest transcript is an intake, the
 * plan it produces and a run of adjustments to it, which lands an order of
 * magnitude inside either bound — they are here to cap what a single call can
 * spend at the model, not to shape what anyone is allowed to ask for.
 *
 * They belong here rather than in the route because this is the only place the
 * posted history is ever trusted. Everything downstream reads the brief, which
 * is bounded field by field by its own schema; the messages array is the one
 * input that reaches the model at whatever size the client chose to send.
 */
export const ChatLimits = {
  /** Two per question, the planning turn, and a long tail of follow-ups. */
  MESSAGES: 100,

  /**
   * The array as posted, measured serialised rather than as prose.
   *
   * The text parts are the cheap half. A reply that priced twenty hotels comes
   * back on the next request with all of their descriptions attached, so a cap
   * that counted only what was typed would bound the small thing and miss the
   * one that costs money.
   */
  CHARACTERS: 200_000,
} as const;

/** The messages array, as the AI SDK's own client sends it. */
function isMessageArray(value: unknown): value is UIMessage[] {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Whether the history is too big to serve, and why.
 *
 * Null when it is fine. The two bounds are separate answers because they fail
 * for different reasons — a hundred short turns and one enormous pasted block
 * are both refused here, and only one of them is fixed by starting over.
 */
function tooLarge(messages: UIMessage[]): string | null {
  if (messages.length > ChatLimits.MESSAGES) {
    return 'This conversation is too long to continue. Start a new trip to keep planning.';
  }

  if (JSON.stringify(messages).length > ChatLimits.CHARACTERS) {
    return 'That message is too large to send. Try shortening it.';
  }

  return null;
}

export async function readChatRequest(request: Request): Promise<ChatRequestResult> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return {
      ok: false,
      status: HttpStatus.BAD_REQUEST,
      message: 'Request body must be valid JSON.',
    };
  }

  if (typeof payload !== 'object' || payload === null) {
    return {
      ok: false,
      status: HttpStatus.BAD_REQUEST,
      message: 'Request body must be an object.',
    };
  }

  const { messages, brief } = payload as { messages?: unknown; brief?: unknown };

  if (!isMessageArray(messages)) {
    return { ok: false, status: HttpStatus.BAD_REQUEST, message: 'No messages provided.' };
  }

  // Ahead of the brief, because this is the check that exists to stop work rather
  // than to catch a mistake: parsing a brief posted alongside ten megabytes of
  // history is doing the cheap half of the job on a request already refused.
  const oversized = tooLarge(messages);
  if (oversized) {
    return { ok: false, status: HttpStatus.PAYLOAD_TOO_LARGE, message: oversized };
  }

  // Absent is valid — the first turn of a conversation has no brief yet — but
  // malformed is not: the brief drives which question comes next, and a partly
  // parsed one would silently re-ask a question the traveller has answered.
  const parsedBrief = tripBriefSchema.safeParse(brief ?? {});
  if (!parsedBrief.success) {
    return { ok: false, status: HttpStatus.BAD_REQUEST, message: 'Invalid trip brief.' };
  }

  return { ok: true, request: { messages, brief: parsedBrief.data } };
}
