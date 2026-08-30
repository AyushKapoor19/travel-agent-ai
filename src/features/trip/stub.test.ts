import { describe, expect, it } from 'vitest';

import { emptyTripBrief, STEP_IDS, type StepId, type TripBrief } from './brief';
import { type StubField, tripStub } from './stub';

/**
 * The document the traveller watches fill in.
 *
 * It is the only running account of what the agent has understood, which is what
 * makes the distinction between a blank field and a declined one worth testing: the
 * rail is read to find out what is left to answer, and a settled question drawn as an
 * unanswered one sends someone back to something they have already decided.
 */

function briefWith(fields: Partial<TripBrief>): TripBrief {
  return { ...emptyTripBrief, ...fields };
}

function field(brief: TripBrief, id: StepId): StubField {
  const found = tripStub(brief).find((candidate) => candidate.id === id);
  if (!found) throw new Error(`No stub field for ${id}`);
  return found;
}

describe('tripStub', () => {
  it('emits one field per question, in the order they are asked', () => {
    expect(tripStub(emptyTripBrief).map((entry) => entry.id)).toEqual([...STEP_IDS]);
  });

  it('starts every field blank', () => {
    expect(tripStub(emptyTripBrief).every((entry) => entry.tone === 'blank')).toBe(true);
  });

  it('never leaves a value empty, so a cell always has something on its line', () => {
    expect(tripStub(emptyTripBrief).every((entry) => entry.value.length > 0)).toBe(true);
  });

  it('fills a field from the brief', () => {
    expect(field(briefWith({ destination: 'Tokyo' }), 'destination')).toMatchObject({
      value: 'Tokyo',
      tone: 'stated',
    });
  });

  /**
   * The case the rail exists to get right. "Not flying" settles the question, and
   * drawn as an empty cell it reads as one still to answer — the same mistake the
   * flow itself used to make when it asked for the airport twice.
   */
  it('marks a declined question as settled rather than blank', () => {
    const declined = briefWith({ answered: ['destination', 'origin'] });

    expect(field(declined, 'origin')).toMatchObject({ value: 'No flight', tone: 'settled' });
  });

  /** An open destination is a ticket written before anyone chose where to go. */
  it('reads an open destination as open rather than missing', () => {
    expect(field(briefWith({ answered: ['destination'] }), 'destination')).toMatchObject({
      value: 'Open',
      tone: 'settled',
    });
  });

  it('prefers the resolved window to the words it was read from', () => {
    const brief = briefWith({
      dates: 'the first week of April',
      startDate: '2026-04-01',
      endDate: '2026-04-08',
    });

    expect(field(brief, 'dates').value).toBe('Apr 1–8');
  });

  it('names both months when the trip crosses one', () => {
    expect(
      field(briefWith({ startDate: '2026-04-28', endDate: '2026-05-03' }), 'dates').value,
    ).toBe('Apr 28 – May 3');
  });

  it('falls back to the traveller words when the dates are still loose', () => {
    expect(field(briefWith({ dates: 'sometime in spring' }), 'dates').value).toBe(
      'sometime in spring',
    );
  });

  it('carries a stated ceiling alongside the level, since they are different claims', () => {
    expect(field(briefWith({ budgetLevel: 'mid-range', maxTotalUsd: 2000 }), 'budget').value).toBe(
      'mid-range · under $2,000',
    );
  });

  /**
   * Travellers defaults to two before anyone has said so, and a cell reading
   * "solo · 2" is the document arguing with itself.
   */
  it('prints the head count only once it cannot be the default', () => {
    expect(field(briefWith({ travelerType: 'solo' }), 'travelers').value).toBe('solo');
    expect(field(briefWith({ travelerType: 'family', travelers: 4 }), 'travelers').value).toBe(
      'family · 4',
    );
  });
});
