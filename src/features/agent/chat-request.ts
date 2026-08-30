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

/** The messages array, as the AI SDK's own client sends it. */
function isMessageArray(value: unknown): value is UIMessage[] {
  return Array.isArray(value) && value.length > 0;
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

  // Absent is valid — the first turn of a conversation has no brief yet — but
  // malformed is not: the brief drives which question comes next, and a partly
  // parsed one would silently re-ask a question the traveller has answered.
  const parsedBrief = tripBriefSchema.safeParse(brief ?? {});
  if (!parsedBrief.success) {
    return { ok: false, status: HttpStatus.BAD_REQUEST, message: 'Invalid trip brief.' };
  }

  return { ok: true, request: { messages, brief: parsedBrief.data } };
}
