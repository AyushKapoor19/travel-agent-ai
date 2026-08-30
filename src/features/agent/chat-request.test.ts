import { describe, expect, it } from 'vitest';

import { HttpStatus } from '@/lib/http';

import { ChatLimits, readChatRequest } from './chat-request';

/**
 * The one endpoint that costs money, and the only place a posted transcript is
 * trusted.
 *
 * The size checks are what most of this covers. Everything downstream is bounded
 * by a schema of its own, so an unbounded array here was the single input that
 * reached the model at whatever size the client felt like sending — and the
 * failure is silent, because an oversized request works exactly as intended right
 * up until the bill.
 */

function message(text: string) {
  return { id: 'm1', role: 'user', parts: [{ type: 'text', text }] };
}

function post(body: unknown): Request {
  return new Request('https://example.test/api/chat', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('readChatRequest', () => {
  it('accepts a conversation with a valid brief', async () => {
    const result = await readChatRequest(post({ messages: [message('Tokyo')] }));

    expect(result.ok).toBe(true);
  });

  it('refuses a body that is not JSON', async () => {
    const request = new Request('https://example.test/api/chat', { method: 'POST', body: 'nope' });

    expect(await readChatRequest(request)).toMatchObject({
      ok: false,
      status: HttpStatus.BAD_REQUEST,
    });
  });

  it('refuses a request with no messages', async () => {
    expect(await readChatRequest(post({ messages: [] }))).toMatchObject({
      ok: false,
      status: HttpStatus.BAD_REQUEST,
    });
  });

  it('refuses a brief it cannot parse', async () => {
    const body = { messages: [message('Tokyo')], brief: { travelers: 900 } };

    expect(await readChatRequest(post(body))).toMatchObject({
      ok: false,
      status: HttpStatus.BAD_REQUEST,
    });
  });

  /** Absent is a real state: the first turn of a conversation has no brief yet. */
  it('accepts a first turn with no brief at all', async () => {
    expect(await readChatRequest(post({ messages: [message('Tokyo')] }))).toMatchObject({
      ok: true,
    });
  });

  it('serves a transcript at the message limit', async () => {
    const messages = Array.from({ length: ChatLimits.MESSAGES }, () => message('ok'));

    expect(await readChatRequest(post({ messages }))).toMatchObject({ ok: true });
  });

  it('refuses one turn past the message limit', async () => {
    const messages = Array.from({ length: ChatLimits.MESSAGES + 1 }, () => message('ok'));

    expect(await readChatRequest(post({ messages }))).toMatchObject({
      ok: false,
      status: HttpStatus.PAYLOAD_TOO_LARGE,
    });
  });

  /**
   * The other half, and the one a message cap alone would miss: a single part
   * carrying more text than an entire conversation of them.
   */
  it('refuses one oversized message', async () => {
    const messages = [message('x'.repeat(ChatLimits.CHARACTERS + 1))];

    expect(await readChatRequest(post({ messages }))).toMatchObject({
      ok: false,
      status: HttpStatus.PAYLOAD_TOO_LARGE,
    });
  });

  /**
   * Measured on the payload rather than on the prose. Tool results ride back on
   * every subsequent request, and they are the large half of a planned trip.
   */
  it('counts tool output towards the size, not just what was typed', async () => {
    const messages = [
      {
        id: 'm1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-searchHotels',
            toolCallId: 'call-1',
            state: 'output-available',
            output: { description: 'y'.repeat(ChatLimits.CHARACTERS) },
          },
        ],
      },
    ];

    expect(await readChatRequest(post({ messages }))).toMatchObject({
      ok: false,
      status: HttpStatus.PAYLOAD_TOO_LARGE,
    });
  });
});
