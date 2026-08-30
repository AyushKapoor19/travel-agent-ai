import { createUIMessageStream, createUIMessageStreamResponse } from 'ai';

import { readChatRequest } from '@/features/agent/chat-request';
import { describeModelError, missingApiKeyMessage } from '@/features/agent/errors';
import type { WayfareUIMessage } from '@/features/agent/messages';
import { hasApiKey } from '@/features/agent/provider';
import { runTurn } from '@/features/agent/turn';
import { HttpStatus } from '@/lib/http';

/**
 * The conversation endpoint.
 *
 * Transport only: it rejects what it cannot serve, hands the rest to `runTurn`,
 * and streams whatever that writes. The decisions about what to ask, what to
 * extract and when to plan all live in the library, so this file has nothing to
 * say about the product.
 */

/** Long enough for a tool round trip plus a full itinerary. */
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!hasApiKey()) {
    return Response.json({ error: missingApiKeyMessage() }, { status: HttpStatus.INTERNAL_ERROR });
  }

  const parsed = await readChatRequest(request);
  if (!parsed.ok) {
    return Response.json({ error: parsed.message }, { status: parsed.status });
  }

  const { messages, brief } = parsed.request;

  const stream = createUIMessageStream<WayfareUIMessage>({
    onError: describeModelError,
    execute: ({ writer }) => runTurn({ writer, messages, brief }),
  });

  return createUIMessageStreamResponse({ stream });
}
