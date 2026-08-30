import { describe, expect, it } from 'vitest';

import type { WayfareMessagePart } from '@/features/agent/messages';
import { TOOL_NAMES } from '@/features/agent/tool-names';

import { planBands } from './bands';

/**
 * Which tool results the plan draws.
 *
 * The failure this guards is two totals. The model prices the trip, settles on a
 * different stay and prices it again, which is the correct thing for it to do and
 * printed two "What it comes to" bands with different figures a screen apart.
 */

/**
 * A tool part, built by hand rather than through the typed helpers.
 *
 * `planBands` reads a part's type, state and interest and nothing else, so the cast
 * buys a readable test and gives up nothing the type system was protecting.
 */
function toolPart(
  tool: string,
  toolCallId: string,
  output?: Record<string, unknown>,
): WayfareMessagePart {
  return {
    type: `tool-${tool}`,
    toolCallId,
    state: output ? 'output-available' : 'input-available',
    input: {},
    output,
  } as WayfareMessagePart;
}

function text(body: string): WayfareMessagePart {
  return { type: 'text', text: body };
}

function ids(parts: readonly WayfareMessagePart[]): string[] {
  return planBands(parts).map((part) => part.toolCallId);
}

describe('planBands', () => {
  it('leaves prose out of the bands', () => {
    expect(ids([text('Seven days in Tokyo.')])).toEqual([]);
  });

  it('keeps one band per tool', () => {
    const parts = [
      toolPart(TOOL_NAMES.GET_WEATHER, 'weather'),
      toolPart(TOOL_NAMES.SEARCH_HOTELS, 'hotels'),
      toolPart(TOOL_NAMES.ESTIMATE_COSTS, 'costs'),
    ];

    expect(ids(parts)).toEqual(['weather', 'hotels', 'costs']);
  });

  /** The one this module exists for. */
  it('keeps only the latest of two totals', () => {
    const parts = [
      toolPart(TOOL_NAMES.ESTIMATE_COSTS, 'first'),
      toolPart(TOOL_NAMES.ESTIMATE_COSTS, 'second'),
    ];

    expect(ids(parts)).toEqual(['second']);
  });

  /**
   * A repriced total belongs where the first one was. Moving it to the foot of the
   * document would reorder the plan every time the model changed its mind.
   */
  it('leaves a replaced band in the position it was opened in', () => {
    const parts = [
      toolPart(TOOL_NAMES.ESTIMATE_COSTS, 'first'),
      toolPart(TOOL_NAMES.SEARCH_HOTELS, 'hotels'),
      toolPart(TOOL_NAMES.ESTIMATE_COSTS, 'second'),
    ];

    expect(ids(parts)).toEqual(['second', 'hotels']);
  });

  /**
   * The exception the prompt asks for: two interests are two bands, because the
   * second search is covering something the first did not.
   */
  it('keeps a band per interest when activities are searched twice', () => {
    const parts = [
      toolPart(TOOL_NAMES.SEARCH_ACTIVITIES, 'food', { category: 'food' }),
      toolPart(TOOL_NAMES.SEARCH_ACTIVITIES, 'art', { category: 'art' }),
    ];

    expect(ids(parts)).toEqual(['food', 'art']);
  });

  it('collapses two searches of the same interest', () => {
    const parts = [
      toolPart(TOOL_NAMES.SEARCH_ACTIVITIES, 'first', { category: 'food' }),
      toolPart(TOOL_NAMES.SEARCH_ACTIVITIES, 'second', { category: 'food' }),
    ];

    expect(ids(parts)).toEqual(['second']);
  });
});
