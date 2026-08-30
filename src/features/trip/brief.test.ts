import { describe, expect, it } from 'vitest';

import {
  describeTrip,
  emptyTripBrief,
  isDestinationOpen,
  isFlightlessTrip,
  MAX_PLANNED_NIGHTS,
  missingDateDetail,
  type TripBrief,
  tripBriefSchema,
  tripNights,
} from './brief';

/**
 * The state the intake branches on.
 *
 * Every case here decides whether a question gets asked again, which is the part of
 * this app a traveller notices most: a brief that reports itself complete when it is
 * not produces a shortlist nothing can be priced for, and one that reports itself
 * incomplete asks the same question twice and looks broken.
 */

function briefWith(fields: Partial<TripBrief>): TripBrief {
  return { ...emptyTripBrief, ...fields };
}

describe('tripNights', () => {
  it('counts the nights between two resolved dates', () => {
    expect(tripNights(briefWith({ startDate: '2026-09-18', endDate: '2026-09-23' }))).toBe(5);
  });

  it('returns null when either date is missing or unparseable', () => {
    expect(tripNights(briefWith({ startDate: '2026-09-18' }))).toBeNull();
    expect(tripNights(briefWith({ endDate: '2026-09-23' }))).toBeNull();
    expect(tripNights(emptyTripBrief)).toBeNull();
  });

  it('returns null rather than a negative count when the dates are reversed', () => {
    expect(tripNights(briefWith({ startDate: '2026-09-23', endDate: '2026-09-18' }))).toBeNull();
  });
});

describe('missingDateDetail', () => {
  it('is satisfied by a window with a plausible duration', () => {
    expect(
      missingDateDetail(briefWith({ startDate: '2026-09-18', endDate: '2026-09-23' })),
    ).toBeNull();
  });

  /**
   * "Five days" on its own used to count as an answer, and it cannot be one: Google
   * prices a stay rather than a place, so a shortlist built from a duration with no
   * window has nothing to quote and the cost line silently disappears.
   */
  it('asks for the window when only a duration is known', () => {
    expect(missingDateDetail(briefWith({ dates: '5 days' }))).toBe('window');
  });

  /**
   * The other half, which arrives from "next month". Resolving that to the whole
   * month gave a 29-night stay and a cost estimate ten times the real trip — an
   * answer that is worse than no answer, because it looks like one.
   */
  it('asks for the duration when the window is implausibly long', () => {
    expect(missingDateDetail(briefWith({ startDate: '2026-09-01', endDate: '2026-09-30' }))).toBe(
      'duration',
    );
  });

  it('accepts a stay right at the cap and rejects one past it', () => {
    const from = new Date('2026-09-01T00:00:00Z');
    const at = new Date(from);
    at.setUTCDate(at.getUTCDate() + MAX_PLANNED_NIGHTS);
    const past = new Date(from);
    past.setUTCDate(past.getUTCDate() + MAX_PLANNED_NIGHTS + 1);

    const iso = (date: Date) => date.toISOString().slice(0, 10);

    expect(missingDateDetail(briefWith({ startDate: '2026-09-01', endDate: iso(at) }))).toBeNull();
    expect(missingDateDetail(briefWith({ startDate: '2026-09-01', endDate: iso(past) }))).toBe(
      'duration',
    );
  });

  it('treats a same-day window as no window at all', () => {
    expect(missingDateDetail(briefWith({ startDate: '2026-09-18', endDate: '2026-09-18' }))).toBe(
      'window',
    );
  });
});

describe('isDestinationOpen', () => {
  it('is true only once the question has been asked and left unanswered', () => {
    // The distinction that makes "surprise me" work: an empty destination mid-interview
    // owes the traveller a question, and an empty one after the step owes a shortlist.
    expect(isDestinationOpen(briefWith({ answered: ['destination'] }))).toBe(true);
    expect(isDestinationOpen(emptyTripBrief)).toBe(false);
  });

  it('is false once somewhere has actually been named', () => {
    expect(isDestinationOpen(briefWith({ answered: ['destination'], destination: 'Lisbon' }))).toBe(
      false,
    );
  });
});

describe('isFlightlessTrip', () => {
  it('is true only once the question has been asked and no origin given', () => {
    expect(isFlightlessTrip(briefWith({ answered: ['destination', 'origin'] }))).toBe(true);
    expect(isFlightlessTrip(emptyTripBrief)).toBe(false);
  });

  it('is false once a departure city has been named', () => {
    expect(isFlightlessTrip(briefWith({ answered: ['origin'], origin: 'Boston' }))).toBe(false);
  });

  /**
   * The distinction the planning turn needs. Both states have an empty `origin`, and
   * only one of them is a gap: told nothing, the model treats a deliberate skip as a
   * missing fact and announces it could not price the flights — to someone who has
   * just said they are not taking one.
   */
  it('is described as settled rather than missing, so no fare gets apologised for', () => {
    const declined = describeTrip(briefWith({ destination: 'Lisbon', answered: ['origin'] }));
    expect(declined).toMatch(/not part of this trip/i);

    expect(describeTrip(briefWith({ destination: 'Lisbon' }))).not.toMatch(/flight/i);
  });
});

describe('describeTrip', () => {
  /**
   * The brief reads `travelers: 2, pace: balanced` from the moment it is created,
   * and stating those flatly made them indistinguishable from answers. The first
   * reply to "a week in Mexico City" came back as "Got it, Mexico City for two" and
   * called it "a balanced week" — two details invented on turn one, out of defaults.
   */
  it('marks the party size and pace as assumed until somebody says otherwise', () => {
    const fresh = describeTrip(briefWith({ destination: 'Mexico City' }));
    expect(fresh).toContain('Travelers: 2 (assumed');
    expect(fresh).toContain('Preferred pace: balanced (assumed');
  });

  it('states them plainly once they have been answered', () => {
    const known = describeTrip(briefWith({ travelerType: 'couple', pace: 'relaxed' }));
    expect(known).toContain('Travelers: 2');
    expect(known).not.toContain('assumed');
  });

  it('treats a head count that is not the default as stated, however it arrived', () => {
    // "Four of us" can land before the travellers question is ever reached.
    expect(describeTrip(briefWith({ travelers: 4 }))).toContain('Travelers: 4');
    expect(describeTrip(briefWith({ travelers: 4 }))).not.toContain('Travelers: 4 (assumed');
  });

  it('still gives the planning turn a number to work with', () => {
    // Labelled, not omitted: a tool call needs a party size even when nobody gave one.
    expect(describeTrip(emptyTripBrief)).toMatch(/Travelers: 2/);
  });
});

describe('tripBriefSchema', () => {
  it('parses an empty object, because the first turn has no brief', () => {
    expect(tripBriefSchema.safeParse({}).success).toBe(true);
  });

  it('coerces a budget ceiling arriving as a string', () => {
    expect(tripBriefSchema.parse({ maxTotalUsd: '2000' }).maxTotalUsd).toBe(2000);
  });

  it('rejects a nonsensical ceiling rather than carrying it into the ranking', () => {
    expect(tripBriefSchema.safeParse({ maxTotalUsd: -5 }).success).toBe(false);
    expect(tripBriefSchema.safeParse({ maxTotalUsd: 0 }).success).toBe(false);
  });

  it('defaults an absent ceiling to null rather than to a number', () => {
    // A zero here would read as "no budget at all" to the scoring, which is the
    // opposite of "no ceiling stated".
    expect(tripBriefSchema.parse({}).maxTotalUsd).toBeNull();
  });

  it('accepts a climate preference, or none, but not an invented one', () => {
    expect(tripBriefSchema.parse({ climate: 'warm' }).climate).toBe('warm');
    expect(tripBriefSchema.parse({}).climate).toBe('');

    // Rejected rather than quietly dropped, and deliberately so: the brief decides
    // which question comes next, and a partly parsed one re-asks something already
    // answered. The route turns this into a 400 instead of a confusing conversation.
    expect(tripBriefSchema.safeParse({ climate: 'tropical' }).success).toBe(false);
  });
});
