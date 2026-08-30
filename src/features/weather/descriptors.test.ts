import { describe, expect, it } from 'vitest';

import { MONTH_NAMES, MONTHS_PER_YEAR } from '@/lib/months';

import { bestMonthIndexes, climateScore, rainWord, temperatureWord } from './descriptors';
import type { ClimateNormals, MonthlyNormal } from './types';

/**
 * The vocabulary and the ranking, which have to stay in agreement.
 *
 * Both are exercised through the same functions the cards and the ranker call, so a
 * card that says "warm and dry" and a reason that says a destination was chosen for
 * being warm and dry cannot come from two different definitions of either word.
 */

function month(monthIndex: number, avgHighC: number, precipitationMm: number): MonthlyNormal {
  return { monthIndex, avgHighC, avgLowC: avgHighC - 8, precipitationMm };
}

/** A full year, so `bestMonthIndexes` gets the twelve months it expects. */
function normalsOf(months: readonly MonthlyNormal[]): ClimateNormals {
  return {
    place: {
      name: 'Testville',
      country: 'Testland',
      latitude: 0,
      longitude: 0,
      timezone: 'UTC',
      population: null,
    },
    months: [...months],
    window: { fromYear: 2015, toYear: 2024 },
  };
}

describe('temperatureWord', () => {
  it('reads a month as the word a traveller would use', () => {
    expect(temperatureWord(4)).toBe('cold');
    expect(temperatureWord(15)).toBe('mild');
    expect(temperatureWord(24)).toBe('warm');
    expect(temperatureWord(34)).toBe('hot');
  });

  it('is total, so no temperature is left without a word', () => {
    for (const highC of [-40, 0, 17.9, 18, 27.9, 28, 60]) {
      expect(temperatureWord(highC)).toMatch(/^(cold|mild|warm|hot)$/);
    }
  });
});

describe('rainWord', () => {
  it('bands a monthly total rather than quoting it', () => {
    expect(rainWord(0)).toBe('dry');
    expect(rainWord(30)).toBe('dry');
    expect(rainWord(31)).toBe('mostly dry');
    expect(rainWord(75)).toBe('mostly dry');
    expect(rainWord(120)).toBe('some rain');
    expect(rainWord(151)).toBe('wet');
    expect(rainWord(400)).toBe('wet');
  });

  it('has no gap between bands, so every total gets a label', () => {
    for (let mm = 0; mm <= 400; mm += 1) {
      expect(rainWord(mm)).toMatch(/^(dry|mostly dry|some rain|wet)$/);
    }
  });
});

describe('climateScore', () => {
  it('gives full marks anywhere inside the requested band', () => {
    expect(climateScore(24, 'warm')).toBe(1);
    expect(climateScore(27, 'warm')).toBe(1);
    expect(climateScore(5, 'cold')).toBe(1);
  });

  it('falls off gradually outside it, so a near miss ranks below rather than out', () => {
    // The difference between a ranking and a filter: 18°C is a fair answer to
    // "warm" and should place under 24°C without being discarded.
    const near = climateScore(16, 'warm');
    expect(near).toBeGreaterThan(0);
    expect(near).toBeLessThan(1);
    expect(near).toBeLessThan(climateScore(17, 'warm'));
  });

  it('scores zero once a month is well outside the band', () => {
    // What stops a 21°C February in Hanoi being offered as a cold-weather trip.
    expect(climateScore(21, 'cold')).toBe(0);
    expect(climateScore(-5, 'hot')).toBe(0);
  });

  it('never leaves the zero-to-one range', () => {
    for (const highC of [-30, 0, 12, 22, 33, 55]) {
      for (const preference of ['cold', 'mild', 'warm', 'hot'] as const) {
        const score = climateScore(highC, preference);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('bestMonthIndexes', () => {
  it('picks the warm dry months of a temperate place', () => {
    // Cool and wet in winter, warm and dry in high summer. July through September
    // sit inside the comfortable band and the shoulder months do not, so the answer
    // is a peak rather than a tie — no reliance on how ties happen to break.
    const lisbonish = normalsOf([
      month(0, 15, 110),
      month(1, 16, 100),
      month(2, 18, 90),
      month(3, 19, 80),
      month(4, 21, 80),
      month(5, 25, 90),
      month(6, 26, 5),
      month(7, 27, 5),
      month(8, 26, 10),
      month(9, 22, 90),
      month(10, 17, 120),
      month(11, 15, 120),
    ]);

    expect(bestMonthIndexes(lisbonish)).toEqual([6, 7, 8]);
  });

  it('breaks a genuine tie by calendar order, so the answer is stable', () => {
    // Four equally good months is a real outcome, and picking three of them must be
    // deterministic — an unstable answer here would change between identical turns.
    const fourGoodMonths = normalsOf(
      Array.from({ length: MONTHS_PER_YEAR }, (_, index) => {
        const summer = index >= 5 && index <= 8;
        return month(index, summer ? 27 : 15, summer ? 10 : 100);
      }),
    );

    expect(bestMonthIndexes(fourGoodMonths)).toEqual([5, 6, 7]);
  });

  /**
   * The bug this whole module was rewritten for.
   *
   * Every month in the tropics sits inside the comfortable temperature band, so
   * temperature cannot choose between them and rain has to. An earlier version
   * clamped the dryness score partway up the range, which tied every month of the
   * wet season on zero — the sort then fell through to calendar order and offered
   * Bali's wettest month, January, as one of its best months to visit.
   */
  it('chooses the dry season when every month is equally warm', () => {
    const baliish = normalsOf(
      Array.from({ length: MONTHS_PER_YEAR }, (_, index) => {
        const wetSeason = index <= 2 || index >= 10;
        return month(index, 27, wetSeason ? 300 : 40);
      }),
    );

    const best = bestMonthIndexes(baliish);

    expect(best).toHaveLength(3);
    for (const monthIndex of best) {
      expect(monthIndex).toBeGreaterThanOrEqual(3);
      expect(monthIndex).toBeLessThanOrEqual(9);
    }
  });

  it('never prefers a cold dry month over a warm damp one', () => {
    // Rain is weighted to separate otherwise equal months, not to outrank warmth.
    const mixed = normalsOf([
      month(0, 4, 0),
      month(1, 4, 0),
      month(2, 4, 0),
      month(3, 4, 0),
      month(4, 4, 0),
      month(5, 4, 0),
      month(6, 24, 90),
      month(7, 24, 90),
      month(8, 24, 90),
      month(9, 4, 0),
      month(10, 4, 0),
      month(11, 4, 0),
    ]);

    expect(bestMonthIndexes(mixed)).toEqual([6, 7, 8]);
  });

  it('bends to a stated preference instead of assuming a beach holiday', () => {
    const fourSeasons = normalsOf(
      Array.from({ length: MONTHS_PER_YEAR }, (_, index) => {
        const winter = index <= 1 || index === 11;
        const summer = index >= 6 && index <= 8;
        return month(index, winter ? 2 : summer ? 26 : 15, 40);
      }),
    );

    expect(bestMonthIndexes(fourSeasons, 'warm')).toEqual([6, 7, 8]);
    // Someone who asked for cold gets the cold months, not the ones a swimsuit wants.
    expect(bestMonthIndexes(fourSeasons, 'cold')).toEqual([0, 1, 11]);
  });

  it('returns months in calendar order and always names real ones', () => {
    const flat = normalsOf(
      Array.from({ length: MONTHS_PER_YEAR }, (_, index) => month(index, 22, 50)),
    );

    const best = bestMonthIndexes(flat);

    expect([...best].sort((a, b) => a - b)).toEqual(best);
    for (const monthIndex of best) expect(MONTH_NAMES[monthIndex]).toBeTruthy();
  });
});
