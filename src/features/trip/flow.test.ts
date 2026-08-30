import { describe, expect, it } from 'vitest';

import { emptyTripBrief, type StepId, type TripBrief } from './brief';
import {
  advanceFlow,
  canReject,
  FLOW_STEPS,
  type FlowStep,
  isDeclineReply,
  MAX_REJECTIONS,
  nextStep,
  recordRejection,
} from './flow';

/**
 * Which question gets asked next, and — the part these tests exist for — which one
 * never gets asked twice.
 *
 * Re-asking is the failure a traveller reads as the app being broken, and it is
 * worst on the questions that were introduced as optional: being told the flights
 * will be skipped and then asked which airport you are flying from is not a rough
 * edge, it is the agent contradicting itself inside two sentences. So the rule these
 * pin down is deliberately stricter than "the extractor usually gets it right":
 * an optional question is asked once, whatever comes back.
 */

function briefWith(fields: Partial<TripBrief>): TripBrief {
  return { ...emptyTripBrief, ...fields };
}

function stepFor(id: StepId): FlowStep {
  const step = FLOW_STEPS.find((candidate) => candidate.id === id);
  if (!step) throw new Error(`No flow step called ${id}`);
  return step;
}

describe('isDeclineReply', () => {
  it('recognises the chips that are themselves a decline', () => {
    expect(isDeclineReply(stepFor('origin'), 'Not flying')).toBe(true);
    expect(isDeclineReply(stepFor('origin'), "I'd rather not say")).toBe(true);
    expect(isDeclineReply(stepFor('destination'), 'Surprise me')).toBe(true);
    expect(isDeclineReply(stepFor('extras'), 'Nothing else')).toBe(true);
  });

  it('matches the same words typed rather than pressed', () => {
    // The chip is rendered with a typographic apostrophe and nobody types one, so a
    // comparison that did not fold them would honour the button and not the sentence.
    expect(isDeclineReply(stepFor('origin'), "i'd rather not say")).toBe(true);
    expect(isDeclineReply(stepFor('origin'), 'not flying!')).toBe(true);
    expect(isDeclineReply(stepFor('origin'), '  Not Flying  ')).toBe(true);
  });

  it('leaves a real answer to the extractor', () => {
    expect(isDeclineReply(stepFor('origin'), 'Boston')).toBe(false);
    expect(isDeclineReply(stepFor('origin'), 'not flying out of Boston until Friday')).toBe(false);
    expect(isDeclineReply(stepFor('origin'), '')).toBe(false);
  });

  it('does not treat every chip on a declinable step as a decline', () => {
    // "Keep it relaxed" sits beside "Nothing else" and is a pace preference, which is
    // an answer. Skipping the extraction for it would throw the answer away.
    expect(isDeclineReply(stepFor('extras'), 'Keep it relaxed')).toBe(false);
  });

  it('is false on the steps where declining is not an answer', () => {
    expect(isDeclineReply(stepFor('dates'), "I'm flexible")).toBe(false);
    expect(isDeclineReply(stepFor('budget'), 'budget')).toBe(false);
  });

  it('only offers chips that are actually on the step', () => {
    // Two lists that have to agree, so this is the check that keeps them agreeing:
    // a decline chip missing from `chips` is one nobody can press.
    for (const step of FLOW_STEPS) {
      for (const chip of step.decline?.chips ?? []) {
        expect(step.chips).toContain(chip);
      }
    }
  });
});

describe('advanceFlow', () => {
  it('marks a step answered once the brief holds a value for it', () => {
    const after = advanceFlow(briefWith({ destination: 'Lisbon' }), stepFor('destination'), false);
    expect(after.answered).toEqual(['destination']);
    expect(after.retries).toBe(0);
  });

  /**
   * The bug this file was written for.
   *
   * "Not flying" reached `advanceFlow` as a reply that had failed to name an airport,
   * because the extractor had been told what refusing looks like and not what a
   * question being moot looks like. The step stayed open and was asked again. The
   * rule now does not depend on that reading being right: origin is optional, so it
   * is asked once and the conversation moves on.
   */
  it('never asks an optional question twice, however the reply was read', () => {
    const asked = briefWith({ destination: 'Mexico City', answered: ['destination'] });

    const after = advanceFlow(asked, stepFor('origin'), false);

    expect(after.answered).toContain('origin');
    expect(after.origin).toBe('');
    expect(nextStep(after)?.id).not.toBe('origin');
  });

  it('settles an optional step when the traveler declines it outright', () => {
    const asked = briefWith({ destination: 'Mexico City', answered: ['destination'] });

    const after = advanceFlow(asked, stepFor('origin'), true);

    expect(after.answered).toContain('origin');
    expect(after.retries).toBe(0);
  });

  it('still records an optional answer when there is one', () => {
    const asked = briefWith({
      destination: 'Mexico City',
      origin: 'Boston',
      answered: ['destination'],
    });

    expect(advanceFlow(asked, stepFor('origin'), false).origin).toBe('Boston');
  });

  /**
   * Destination is the exception, and the only one: it is what the whole trip hangs
   * off, and falling back to a shortlist because one reply was misread is a much
   * bigger silent substitution than doing without a fare.
   */
  it('gives the destination one more attempt before leaving it open', () => {
    const first = advanceFlow(emptyTripBrief, stepFor('destination'), false);
    expect(first.answered).not.toContain('destination');
    expect(first.retries).toBe(1);

    const second = advanceFlow(first, stepFor('destination'), false);
    expect(second.answered).toContain('destination');
    expect(second.retries).toBe(0);
  });

  it('gives a required step one re-ask and then moves on rather than deadlocking', () => {
    const asked = briefWith({ destination: 'Lisbon', answered: ['destination', 'origin'] });

    const first = advanceFlow(asked, stepFor('dates'), false);
    expect(first.answered).not.toContain('dates');
    expect(first.retries).toBe(1);

    const second = advanceFlow(first, stepFor('dates'), false);
    expect(second.answered).toContain('dates');
  });

  it('resets the retry count once the step is settled, so it cannot leak forwards', () => {
    const stalled = briefWith({ destination: 'Lisbon', answered: ['destination'], retries: 1 });

    // Without the reset the next required step would inherit an exhausted budget and
    // be skipped without ever being asked.
    expect(advanceFlow(stalled, stepFor('origin'), true).retries).toBe(0);
  });

  it('marks every other step the same reply happened to answer', () => {
    // "Two of us in Tokyo for a week in September, mid-range, we love food."
    const all = briefWith({
      destination: 'Tokyo',
      startDate: '2026-09-18',
      endDate: '2026-09-25',
      budgetLevel: 'mid-range',
      interests: ['Food & dining'],
      travelerType: 'couple',
    });

    const after = advanceFlow(all, stepFor('destination'), false);

    expect(after.answered).toEqual(
      expect.arrayContaining(['destination', 'dates', 'budget', 'interests', 'travelers']),
    );
    expect(nextStep(after)?.id).toBe('origin');
  });
});

/**
 * Handing a reply back instead of absorbing it, and the two ways that goes wrong.
 *
 * The behaviour is a refusal, which makes both failure modes expensive in opposite
 * directions: absorb an unreadable answer and "asdkjhasd" is filed as the travel
 * dates, refuse one too readily and a traveller with a real answer is locked out of
 * their own intake. So what these pin down is the shape of the budget — that it
 * exists, that it is spent on refusals only, and that it is per question.
 */
describe('rejecting an unreadable reply', () => {
  it('allows a fresh step to refuse, and stops after the cap', () => {
    expect(canReject(emptyTripBrief)).toBe(true);
    expect(canReject(briefWith({ rejections: MAX_REJECTIONS - 1 }))).toBe(true);
    expect(canReject(briefWith({ rejections: MAX_REJECTIONS }))).toBe(false);
  });

  it('spends only the refusal budget, leaving the step otherwise untouched', () => {
    // A refusal is not a re-ask: the traveller is shown the same question with a
    // reason attached, so the re-ask a genuinely misread reply is owed is still there.
    const asked = briefWith({ destination: 'Lisbon', answered: ['destination'] });

    const after = recordRejection(asked);

    expect(after.rejections).toBe(1);
    expect(after.retries).toBe(0);
    expect(after.answered).toEqual(['destination']);
    expect(after.dates).toBe('');
  });

  it('runs out of refusals rather than refusing forever', () => {
    let brief: TripBrief = emptyTripBrief;
    for (let attempt = 0; attempt < MAX_REJECTIONS; attempt += 1) {
      expect(canReject(brief)).toBe(true);
      brief = recordRejection(brief);
    }

    // Past the cap the reply takes the ordinary path — read, retried once, then let
    // through — which is where every reply went before any of this existed.
    expect(canReject(brief)).toBe(false);
  });

  it('gives the budget back to each question, so it cannot be spent across the intake', () => {
    // Carried forwards, three unreadable replies spread over an entire conversation
    // would leave the last question unable to refuse anything at all.
    const spent = briefWith({ destination: 'Lisbon', rejections: MAX_REJECTIONS });

    const after = advanceFlow(spent, stepFor('destination'), false);

    expect(after.rejections).toBe(0);
    expect(canReject(after)).toBe(true);
  });

  it('gives it back on a reply that was accepted without settling the step', () => {
    // The re-ask turn. The traveller said something readable and it did not answer the
    // question, which says nothing about whether their next attempt will be readable.
    const stalled = briefWith({ rejections: 1 });

    const after = advanceFlow(stalled, stepFor('destination'), false);

    expect(after.answered).not.toContain('destination');
    expect(after.retries).toBe(1);
    expect(after.rejections).toBe(0);
  });
});

describe('nextStep', () => {
  it('walks the steps in order and reports completion by returning null', () => {
    expect(nextStep(emptyTripBrief)?.id).toBe('destination');
    expect(nextStep(briefWith({ answered: ['destination'] }))?.id).toBe('origin');
    expect(nextStep(briefWith({ answered: FLOW_STEPS.map((step) => step.id) }))).toBeNull();
  });
});
