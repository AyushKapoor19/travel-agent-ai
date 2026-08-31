import { describe, expect, it } from 'vitest';

import type { WayfareMessagePart, WayfareUIMessage } from '@/features/agent/messages';
import { TOOL_NAMES } from '@/features/agent/tool-names';

import { readStage, StageKind } from './stage';

/**
 * Which screen the traveller is looking at.
 *
 * The costly failure here is a finished plan losing its place. The itinerary takes
 * twenty seconds of streaming and six provider calls to produce, and every turn
 * after the intake is a planning turn as far as the server is concerned — so the
 * question of what counts as a plan is the difference between an adjustment being
 * answered above the document and an adjustment replacing it with nothing.
 */

let sequence = 0;

function assistant(text: string, extra: WayfareMessagePart[] = []): WayfareUIMessage {
  sequence += 1;
  return {
    id: `assistant-${sequence}`,
    role: 'assistant',
    parts: [{ type: 'text', text }, ...extra],
  };
}

function user(text: string): WayfareUIMessage {
  sequence += 1;
  return { id: `user-${sequence}`, role: 'user', parts: [{ type: 'text', text }] };
}

/**
 * A tool call, built by hand rather than through the typed helpers.
 *
 * `readStage` only asks whether a part is a tool call at all, so the cast buys a
 * readable test and gives up nothing the type system was protecting.
 */
function hotelSearch(): WayfareMessagePart {
  return {
    type: `tool-${TOOL_NAMES.SEARCH_HOTELS}`,
    toolCallId: 'call-1',
    state: 'input-available',
    input: { destination: 'Tokyo' },
  } as WayfareMessagePart;
}

function flightSearch(): WayfareMessagePart {
  return {
    type: `tool-${TOOL_NAMES.SEARCH_FLIGHTS}`,
    toolCallId: 'call-2',
    state: 'input-available',
    input: { origin: 'YOW', destination: 'CUN' },
  } as WayfareMessagePart;
}

/** What the document would draw, which is the thing every case here is really about. */
function planText(stage: ReturnType<typeof readStage>): string {
  if (stage.kind !== StageKind.PLAN) throw new Error('expected the plan');
  return stage.parts
    .filter((part) => part.type === 'text')
    .map((part) => (part as { text: string }).text)
    .join('');
}

function toolTypes(stage: ReturnType<typeof readStage>): string[] {
  if (stage.kind !== StageKind.PLAN) throw new Error('expected the plan');
  return stage.parts.filter((part) => part.type.startsWith('tool-')).map((part) => part.type);
}

const ITINERARY = 'Here is the week.\n\n## Day 1: Asakusa\n\nStart early.';

describe('readStage', () => {
  it('is intake before anything has been said', () => {
    expect(readStage([], false)).toEqual({
      kind: StageKind.INTAKE,
      prompt: '',
      promptId: null,
    });
  });

  it('takes the newest question as the prompt', () => {
    const asking = assistant('And where would you be flying from?');
    const messages = [assistant('Where do you want to go?'), user('Tokyo'), asking];

    expect(readStage(messages, false)).toEqual({
      kind: StageKind.INTAKE,
      prompt: 'And where would you be flying from?',
      promptId: asking.id,
    });
  });

  /**
   * What the crossing between two questions turns on. The text cannot carry it: a
   * question arrives a token at a time, so a transition driven by the string would fire
   * on every token and never finish.
   */
  it('names the reply the question came from, and keeps naming it as it is written', () => {
    const partial = assistant('And where wou');
    const first = readStage([user('Tokyo'), partial], false);

    partial.parts = [{ type: 'text', text: 'And where would you be flying from?' }];
    const grown = readStage([user('Tokyo'), partial], false);

    expect(first).toMatchObject({ promptId: partial.id });
    expect(grown).toMatchObject({ promptId: partial.id });
  });

  /**
   * The prompt survives the wait. The traveller has answered, the next question has
   * not arrived, and blanking the screen for the round trip would read as the page
   * having lost its place.
   */
  it('keeps the last question while an answer is being read', () => {
    expect(readStage([assistant('Who is travelling?'), user('two of us')], false)).toMatchObject({
      prompt: 'Who is travelling?',
    });
  });

  it('reads a reply with day headings as the plan', () => {
    expect(readStage([user('go'), assistant(ITINERARY)], false).kind).toBe(StageKind.PLAN);
  });

  it('reads a reply that priced stays as the plan', () => {
    expect(readStage([user('go'), assistant('', [hotelSearch()])], false).kind).toBe(
      StageKind.PLAN,
    );
  });

  /**
   * The case content cannot answer. The intake is over, the ticket is complete, and
   * the first day heading is twenty seconds away — so the phase is what moves the
   * screen over, and the document draws its masthead from the brief in the meantime.
   */
  it('opens the document on a planning turn that has not started', () => {
    expect(readStage([assistant('Anything else?'), user('nothing')], true)).toEqual({
      kind: StageKind.PLAN,
      parts: [],
      followUps: [],
    });
  });

  it('hands the document the reply being written once it starts', () => {
    const stage = readStage([user('nothing'), assistant('Tokyo in a week, then.')], true);

    expect(planText(stage)).toBe('Tokyo in a week, then.');
  });

  /** A shortlist has no days by design, and is still the document. */
  it('draws a shortlist as the document', () => {
    const shortlist = assistant('Three that fit.', [hotelSearch()]);

    expect(planText(readStage([user('you pick'), shortlist], false))).toBe('Three that fit.');
  });

  /**
   * The regression this shape exists to prevent. Every turn after the intake is a
   * planning turn, so a one-line answer arrives with `planning` set — and trusting
   * that would put a reply with no days in it where the itinerary was and demote the
   * itinerary to prose in the conversation underneath.
   */
  it('keeps the document when a follow-up is answered in one line', () => {
    const plan = assistant(ITINERARY);
    const question = user('does Tuesday work?');
    const answer = assistant('It does — the museum is open.');

    const stage = readStage([plan, question, answer], true);

    if (stage.kind !== StageKind.PLAN) throw new Error('expected the plan');
    expect(planText(stage)).toBe(ITINERARY);
    expect(stage.followUps.map((message) => message.id)).toEqual([question.id, answer.id]);
  });

  /**
   * The bug this shape was rebuilt for. "What would the flights cost" is a planning
   * turn that calls a tool and answers in a paragraph, and on the strength of the tool
   * call alone that paragraph took the document's place — so the seven days the
   * traveller had just been given went off the screen and the fares became the plan.
   */
  it('leaves a follow-up search in the thread with the answer it belongs to', () => {
    const plan = assistant(ITINERARY, [hotelSearch()]);
    const asked = user('what would the flights cost?');
    const priced = assistant('About $940 for the two of you.', [flightSearch()]);

    const stage = readStage([plan, asked, priced], false);

    expect(planText(stage)).toBe(ITINERARY);
    // The fares are drawn beside the sentence about them, not lifted up beside the
    // stays a screen away.
    expect(toolTypes(stage)).toEqual([`tool-${TOOL_NAMES.SEARCH_HOTELS}`]);
    if (stage.kind !== StageKind.PLAN) throw new Error('expected the plan');
    expect(stage.followUps.map((message) => message.id)).toEqual([asked.id, priced.id]);
  });

  /** And its prose stays in the conversation, where it was an answer to a question. */
  it('leaves a follow-up reply in the thread rather than reading it into the plan', () => {
    const plan = assistant(ITINERARY);
    const priced = assistant('About $940 for the two of you.', [flightSearch()]);

    const stage = readStage([plan, user('and the flights?'), priced], false);

    expect(planText(stage)).not.toContain('$940');
    if (stage.kind !== StageKind.PLAN) throw new Error('expected the plan');
    expect(stage.followUps.map((message) => message.id)).toContain(priced.id);
  });

  /**
   * The whole point of the shape. A change to the trip is written underneath the trip,
   * because everything before the document is off the screen by construction — so a
   * revision that took the document's place would take the plan it revises, and the
   * conversation that produced it, down with it.
   */
  it('keeps the delivered plan as the document when a day is rewritten', () => {
    const plan = assistant(ITINERARY);
    const asked = user('put the museum on day 1 instead');
    const revised = assistant('Day 1 shifts to Ueno.\n\n## Day 1: Ueno');

    const stage = readStage([plan, asked, revised], true);

    expect(planText(stage)).toBe(ITINERARY);
    if (stage.kind !== StageKind.PLAN) throw new Error('expected the plan');
    expect(stage.followUps.map((message) => message.id)).toEqual([asked.id, revised.id]);
  });

  /** Including a rebuild large enough to be a different trip. It is still an answer. */
  it('keeps the document when the whole trip is written again', () => {
    const first = assistant(ITINERARY);
    const asked = user('try Osaka instead');
    const revised = assistant('Osaka, then.\n\n## Day 1: Namba', [hotelSearch()]);

    const stage = readStage([first, asked, revised], true);

    expect(planText(stage)).toBe(ITINERARY);
    if (stage.kind !== StageKind.PLAN) throw new Error('expected the plan');
    expect(stage.followUps.map((message) => message.id)).toEqual([asked.id, revised.id]);
  });

  /**
   * The exception, and the only one: before any reply has written a day the newest plan
   * is the document. That is the shortlist and the build that answers it — the
   * shortlist stops being the answer the moment a city is picked.
   */
  it('hands the document to the trip built from a shortlist', () => {
    const shortlist = assistant('Three that fit.', [hotelSearch()]);
    const built = assistant(ITINERARY, [flightSearch()]);

    const stage = readStage([shortlist, user('Tokyo'), built], true);

    expect(planText(stage)).toBe(ITINERARY);
    if (stage.kind !== StageKind.PLAN) throw new Error('expected the plan');
    expect(stage.followUps).toEqual([]);
  });
});
