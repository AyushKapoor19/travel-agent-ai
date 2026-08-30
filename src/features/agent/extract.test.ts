import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StepId, TripBrief } from '@/features/trip/brief';
import { emptyTripBrief } from '@/features/trip/brief';
import type { FlowStep } from '@/features/trip/flow';
import { FLOW_STEPS } from '@/features/trip/flow';

/**
 * The extractor, tested through the real module with the model stubbed out.
 *
 * `npm run eval` already runs this code against a live Gemini, and it is the right
 * place to ask whether the model reads a sentence correctly. It is the wrong place
 * to pin down what happens *to* a reading once we have one: that part is ordinary
 * branching, it decides whether a step closes, and checking it against a live model
 * costs quota and passes or fails on a coin toss.
 *
 * Both bugs below were found by the evals and neither was reliably reproducible
 * there — the first one depended on whether the model felt like repeating itself.
 * So the seam is `generateObject`, and everything above it is the code that ships.
 */

/** The extractor's output shape, which the module itself keeps private. */
type Reading = {
  destination: string | null;
  origin: string | null;
  dates: string | null;
  startDate: string | null;
  endDate: string | null;
  budgetLevel: 'budget' | 'mid-range' | 'luxury' | null;
  maxTotalUsd: number | null;
  climate: 'cold' | 'mild' | 'warm' | 'hot' | null;
  interests: string[] | null;
  travelerType: 'solo' | 'couple' | 'family' | 'friends' | null;
  travelers: number | null;
  extras: string | null;
  pace: 'relaxed' | 'balanced' | 'packed' | null;
  declined: boolean;
  unusable: 'gibberish' | 'off-topic' | null;
};

const generateObject = vi.fn<(options: { prompt: string }) => Promise<{ object: Reading }>>();

vi.mock('ai', () => ({
  generateObject: (options: { prompt: string }) => generateObject(options),
}));

vi.mock('./provider', () => ({
  conversationModel: () => 'stub-model',
}));

const { extractBrief } = await import('./extract');

/** A reading that reports nothing, which is what a greeting should produce. */
const NOTHING: Reading = {
  destination: null,
  origin: null,
  dates: null,
  startDate: null,
  endDate: null,
  budgetLevel: null,
  maxTotalUsd: null,
  climate: null,
  interests: null,
  travelerType: null,
  travelers: null,
  extras: null,
  pace: null,
  declined: false,
  unusable: null,
};

function reads(reading: Partial<Reading>): void {
  generateObject.mockResolvedValueOnce({ object: { ...NOTHING, ...reading } });
}

function stepFor(id: StepId): FlowStep {
  const step = FLOW_STEPS.find((candidate) => candidate.id === id);
  if (!step) throw new Error(`No flow step called ${id}`);
  return step;
}

function briefWith(fields: Partial<TripBrief>): TripBrief {
  return { ...emptyTripBrief, ...fields };
}

/**
 * A brief with every disclosed field filled, so any one of them coming back is an
 * echo. Kept together with the key assertion below.
 */
const knownEverything = briefWith({
  destination: 'Lisbon',
  origin: 'Boston',
  dates: 'first week of October',
  budgetLevel: 'mid-range',
  maxTotalUsd: 2000,
  climate: 'warm',
  interests: ['Food & dining'],
  travelerType: 'couple',
});

beforeEach(() => {
  generateObject.mockReset();
});

describe('a reading that only repeats what the model was told', () => {
  /*
   * The live failure, and the reason the empty-reply check needed a second look.
   *
   * "hey" on the dates question, for a trip already known to be going to Lisbon,
   * comes back as `{ destination: "Lisbon" }` — the model is shown the brief as
   * context and handing a piece of it back is not obviously wrong to it. Counted as
   * news, that one echo cleared the check, `advance` marked dates answered on the
   * strength of it, and the planning turn went looking for a stay with no dates to
   * price it for.
   */
  it('is refused rather than counted as an answer', async () => {
    reads({ destination: 'Lisbon', interests: [] });

    const result = await extractBrief(
      briefWith({ destination: 'Lisbon', answered: ['destination', 'origin'] }),
      stepFor('dates'),
      'hey',
    );

    expect(result.unusable).toBe('unanswered');
    expect(result.brief.dates).toBe('');
  });

  it('is recognised through a difference of case or spacing', async () => {
    reads({ destination: '  lisbon ' });

    const result = await extractBrief(
      briefWith({ destination: 'Lisbon' }),
      stepFor('dates'),
      'hey',
    );

    expect(result.unusable).toBe('unanswered');
  });

  it('hands the brief back untouched, spending nothing', async () => {
    const brief = briefWith({ destination: 'Lisbon', retries: 0 });
    reads({ destination: 'Lisbon' });

    const result = await extractBrief(brief, stepFor('dates'), 'hey');

    expect(result.brief).toEqual(brief);
    expect(result.declined).toBe(false);
  });

  it('refuses a reading that echoes every disclosed field at once', async () => {
    reads({
      destination: 'Lisbon',
      origin: 'Boston',
      dates: 'first week of October',
      budgetLevel: 'mid-range',
      maxTotalUsd: 2000,
      climate: 'warm',
      interests: ['Food & dining'],
      travelerType: 'couple',
    });

    const result = await extractBrief(knownEverything, stepFor('extras'), 'ok');

    expect(result.unusable).toBe('unanswered');
  });

  /*
   * The drift guard. The prompt names the fields the model is shown and the echo
   * check names the fields an echo is possible for, and they are two lists in two
   * places. A field added to the first but not the second is a field the model can
   * answer any question with, silently — which is exactly the bug above, restored.
   */
  it('discloses no field the echo check above does not cover', async () => {
    reads({});
    await extractBrief(knownEverything, stepFor('extras'), 'ok');

    const call = generateObject.mock.calls[0];
    if (!call) throw new Error('the extractor never reached the model');

    const marker = 'Already known (do not repeat unless the reply changes it):';
    const at = call[0].prompt.indexOf(marker);
    if (at < 0) throw new Error('the prompt no longer labels the known fields');

    const disclosed = JSON.parse(call[0].prompt.slice(at + marker.length)) as Record<
      string,
      unknown
    >;

    expect(Object.keys(disclosed).sort()).toEqual([
      'budgetLevel',
      'climate',
      'dates',
      'destination',
      'interests',
      'maxTotalUsd',
      'origin',
      'travelerType',
    ]);
  });
});

describe('a reading that says something new', () => {
  it('accepts a correction to a field we had already filled', async () => {
    reads({ destination: 'Porto' });

    const result = await extractBrief(
      briefWith({ destination: 'Lisbon' }),
      stepFor('dates'),
      'actually make it Porto',
    );

    expect(result.unusable).toBeNull();
    expect(result.brief.destination).toBe('Porto');
  });

  it('accepts an interest that is not already on the brief', async () => {
    reads({ interests: ['Food & dining', 'Beaches'] });

    const result = await extractBrief(
      briefWith({ interests: ['Food & dining'] }),
      stepFor('interests'),
      'beaches too',
    );

    expect(result.unusable).toBeNull();
    expect(result.brief.interests).toContain('Beaches');
  });

  /*
   * The negative that keeps the echo rule from eating the commonest answer in
   * travel. `travelers` defaults to 2 before anyone is asked, so a couple replying
   * "just the two of us" reports a value the brief already holds — and would read as
   * an echo if the rule compared every field rather than only the disclosed ones.
   * It is deliberately kept out of the context the model is shown for this reason.
   */
  it('counts a head count that matches the default as an answer', async () => {
    reads({ travelers: 2 });

    const result = await extractBrief(
      briefWith({ travelers: 2 }),
      stepFor('travelers'),
      'just the two of us',
    );

    expect(result.unusable).toBeNull();
    expect(result.brief.travelers).toBe(2);
  });
});

describe('declining', () => {
  /*
   * Three of the seven questions offer no way out, and the model says "they
   * declined" on them anyway — "idk" to the budget question is the reliable one.
   * `isSettled` was already reading `step.decline` before acting on the flag, so the
   * step never closed; what the stray flag did instead was exempt the reply from
   * being handed back, and tell the next turn to acknowledge a refusal that had not
   * happened.
   */
  it('is ignored on a question that does not offer it', async () => {
    reads({ declined: true });

    const result = await extractBrief(
      briefWith({ destination: 'Lisbon', answered: ['destination', 'origin', 'dates'] }),
      stepFor('budget'),
      'idk',
    );

    expect(result.declined).toBe(false);
    expect(result.unusable).toBe('unanswered');
  });

  it('settles a question that does offer it', async () => {
    reads({ declined: true });

    const result = await extractBrief(
      briefWith({ destination: 'Mexico City' }),
      stepFor('origin'),
      "we're driving down",
    );

    expect(result.declined).toBe(true);
    expect(result.unusable).toBeNull();
  });

  it('never lets the refusal itself be recorded as the answer', async () => {
    reads({ declined: true, origin: 'driving' });

    const result = await extractBrief(
      briefWith({ destination: 'Mexico City' }),
      stepFor('origin'),
      "we're driving down, no flights",
    );

    expect(result.brief.origin).toBe('');
  });
});

describe('when the model cannot be reached', () => {
  /*
   * An outage and an empty reading look identical from here and call for opposite
   * responses. Refusing the traveller's perfectly good sentence because we could not
   * read it is blaming them for our own quota.
   */
  it('keeps the traveller own words on a free-text step', async () => {
    generateObject.mockRejectedValueOnce(new Error('quota exhausted'));

    const result = await extractBrief(
      briefWith({ destination: 'Lisbon' }),
      stepFor('dates'),
      'sometime in May for a week',
    );

    expect(result.unusable).toBeNull();
    expect(result.brief.dates).toBe('sometime in May for a week');
  });
});
