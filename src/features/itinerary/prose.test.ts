import { describe, expect, it } from 'vitest';

import type { WayfareMessagePart } from '@/features/agent/messages';
import { TOOL_NAMES } from '@/features/agent/tool-names';

import { planProse } from './prose';

/**
 * The reply narrating itself instead of answering.
 *
 * A reasoning model handed a prompt that opens "decide which of two turns this is"
 * answers the prompt: it reads the brief back, writes out the five searches with
 * their arguments, and says "Let's do the required tool calls". None of that has a
 * heading in it, so it landed in the intro and was set as the opening paragraph of
 * the itinerary — over a page of cards drawing the same searches.
 */

function text(value: string): WayfareMessagePart {
  return { type: 'text', text: value };
}

function tool(name: string, id: string): WayfareMessagePart {
  return {
    type: `tool-${name}`,
    toolCallId: id,
    state: 'output-available',
    input: {},
    output: {},
  } as WayfareMessagePart;
}

const NARRATION = `The brief is complete and specific: Destination: Mexico City

Let's do the required tool calls:
- get_weather: place="Mexico City"
- search_hotels: destination="Mexico City"`;

const PLAN = 'Seven days in Mexico City.\n\n## Day 1: Centro Histórico';

describe('planProse', () => {
  it('drops what the model said while it was still searching', () => {
    const parts = [
      text(NARRATION),
      tool(TOOL_NAMES.GET_WEATHER, 'call-1'),
      tool(TOOL_NAMES.SEARCH_HOTELS, 'call-2'),
      text(PLAN),
    ];

    expect(planProse(parts)).toBe(PLAN);
  });

  /** Narration between two calls is the same recital, one sentence at a time. */
  it('drops it when it is spread through the calls', () => {
    const parts = [
      text('First I will check the weather.'),
      tool(TOOL_NAMES.GET_WEATHER, 'call-1'),
      text('Now the hotels.'),
      tool(TOOL_NAMES.SEARCH_HOTELS, 'call-2'),
      text(PLAN),
    ];

    expect(planProse(parts)).toBe(PLAN);
  });

  /**
   * The case the guard is conditional for. A reply that wrote the trip and then
   * made one more call has nothing after that call, and dropping everything before
   * it would take the whole itinerary off the page — much the worse failure.
   */
  it('keeps the text when a call came last and nothing followed it', () => {
    const parts = [text(PLAN), tool(TOOL_NAMES.ESTIMATE_COSTS, 'call-1')];

    expect(planProse(parts)).toBe(PLAN);
  });

  it('leaves a reply with no tool calls alone', () => {
    expect(planProse([text('It does — the museum is open on Tuesday.')])).toBe(
      'It does — the museum is open on Tuesday.',
    );
  });

  /** While the searches run there is no prose yet, so there is nothing to prefer. */
  it('is quiet while the turn is still streaming its calls', () => {
    const parts = [tool(TOOL_NAMES.SEARCH_HOTELS, 'call-1')];

    expect(planProse(parts)).toBe('');
  });
});
