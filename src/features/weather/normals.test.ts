import { describe, expect, it } from 'vitest';

import { MONTHS_PER_YEAR } from '@/lib/months';

import { aggregateNormals, normalsWindow } from './normals';
import type { DailySeries } from './open-meteo';

/**
 * A decade of days reduced to twelve numbers, checked on a fixed series.
 *
 * This is the arithmetic every temperature and rain band in the app rests on, and
 * it is pure, so it can be pinned exactly rather than approximately — which is the
 * entire reason it lives apart from the transport that fetches the series.
 */

type Day = { date: string; highC: number | null; lowC: number | null; rainMm: number | null };

function seriesOf(days: readonly Day[]): DailySeries {
  return {
    time: days.map((day) => day.date),
    highC: days.map((day) => day.highC),
    lowC: days.map((day) => day.lowC),
    precipitationMm: days.map((day) => day.rainMm),
  };
}

function day(date: string, highC: number, lowC: number, rainMm: number): Day {
  return { date, highC, lowC, rainMm };
}

describe('aggregateNormals', () => {
  it('always returns twelve months, even from an empty series', () => {
    // Callers check for a complete year; a short array would read as a partial answer
    // rather than as no answer, which is a harder failure to see.
    const months = aggregateNormals(seriesOf([]));

    expect(months).toHaveLength(MONTHS_PER_YEAR);
    expect(months.map((month) => month.monthIndex)).toEqual([...Array(MONTHS_PER_YEAR).keys()]);
  });

  it('averages temperatures over the days that reported one', () => {
    const months = aggregateNormals(
      seriesOf([day('2020-01-01', 10, 2, 0), day('2020-01-02', 20, 8, 0)]),
    );

    expect(months[0]?.avgHighC).toBe(15);
    expect(months[0]?.avgLowC).toBe(5);
  });

  it('skips missing readings rather than counting them as zero', () => {
    // A null averaged as 0 would drag a January mean down by a third here, which
    // reads as a colder city rather than as a gap in the archive.
    const months = aggregateNormals(
      seriesOf([
        day('2020-01-01', 10, 2, 0),
        { date: '2020-01-02', highC: null, lowC: null, rainMm: null },
        day('2020-01-03', 20, 8, 0),
      ]),
    );

    expect(months[0]?.avgHighC).toBe(15);
  });

  it('rounds to the one decimal the archive earns and the card shows', () => {
    const months = aggregateNormals(
      seriesOf([
        day('2020-03-01', 10, 0, 0),
        day('2020-03-02', 11, 0, 0),
        day('2020-03-03', 13, 0, 0),
      ]),
    );

    expect(months[2]?.avgHighC).toBe(11.3);
  });

  /**
   * The subtle one, and it fails in the flattering direction.
   *
   * Rain is a monthly total per year, so it must divide by the number of years that
   * month actually appears in. Dividing by the nominal window length instead would
   * report nine years of rain spread over ten and make a wet destination look drier
   * than it is — an error that argues for going somewhere.
   */
  it('divides rain by the years present, not by the window length', () => {
    const months = aggregateNormals(
      seriesOf([
        day('2020-06-01', 25, 15, 100),
        day('2021-06-01', 25, 15, 100),
        day('2022-06-01', 25, 15, 100),
      ]),
    );

    expect(months[5]?.precipitationMm).toBe(100);
  });

  it('totals rain within a year before averaging across years', () => {
    const months = aggregateNormals(
      seriesOf([
        day('2020-06-01', 25, 15, 60),
        day('2020-06-02', 25, 15, 40),
        day('2021-06-01', 25, 15, 200),
      ]),
    );

    expect(months[5]?.precipitationMm).toBe(150);
  });

  it('files each day under its own month', () => {
    const months = aggregateNormals(
      seriesOf([day('2020-01-15', 5, 0, 10), day('2020-07-15', 30, 20, 1)]),
    );

    expect(months[0]?.avgHighC).toBe(5);
    expect(months[6]?.avgHighC).toBe(30);
    expect(months[3]?.avgHighC).toBe(0);
  });

  it('ignores a timestamp it cannot read instead of throwing', () => {
    const months = aggregateNormals(
      seriesOf([
        { date: 'not-a-date', highC: 99, lowC: 99, rainMm: 99 },
        day('2020-01-01', 10, 2, 5),
      ]),
    );

    expect(months[0]?.avgHighC).toBe(10);
  });
});

describe('normalsWindow', () => {
  it('resolves against today rather than being written down', () => {
    // A hardcoded pair of years is a dataset with an expiry nobody notices passing.
    expect(normalsWindow(new Date('2026-05-01T00:00:00Z'))).toEqual({
      fromYear: 2016,
      toYear: 2025,
    });
  });

  it('always spans ten years, ending on the last complete one', () => {
    for (const year of [2024, 2030, 2040]) {
      const { fromYear, toYear } = normalsWindow(new Date(`${year}-01-01T00:00:00Z`));

      expect(toYear).toBe(year - 1);
      expect(toYear - fromYear + 1).toBe(10);
    }
  });
});
