import 'server-only';

import { MONTHS_PER_YEAR } from '@/lib/months';

import { NORMALS_END_YEAR_OFFSET, NORMALS_YEARS } from './constants';
import type { DailySeries } from './open-meteo';
import type { MonthlyNormal } from './types';

/**
 * Turning a decade of observed days into twelve numbers.
 *
 * Kept apart from the transport so it can be exercised on a fixed series with no
 * network: "these observations average to this normal" is arithmetic, and
 * arithmetic should be testable without a rate limit in the way.
 */

/**
 * The window, resolved against today rather than written down.
 *
 * A hardcoded pair of years is a dataset with an expiry date nobody notices
 * passing — it keeps working, quietly describing a decade that ended years ago.
 */
export function normalsWindow(now: Date = new Date()): { fromYear: number; toYear: number } {
  const toYear = now.getUTCFullYear() - NORMALS_END_YEAR_OFFSET;
  return { fromYear: toYear - (NORMALS_YEARS - 1), toYear };
}

type MonthAccumulator = {
  highTotal: number;
  highCount: number;
  lowTotal: number;
  lowCount: number;
  precipTotal: number;
  years: Set<number>;
};

function emptyAccumulator(): MonthAccumulator {
  return { highTotal: 0, highCount: 0, lowTotal: 0, lowCount: 0, precipTotal: 0, years: new Set() };
}

/** Rounded to one decimal: the precision the archive earns and the UI shows. */
function mean(total: number, count: number): number {
  return count === 0 ? 0 : Math.round((total / count) * 10) / 10;
}

/**
 * Monthly normals from a daily series.
 *
 * Temperatures average over the days that reported one. Rain is a monthly total
 * divided by the number of distinct years that month actually appeared in, not by
 * the nominal window length — when the archive is missing a stretch, dividing by
 * ten years for nine years of data understates the rain, which is precisely the
 * direction that would flatter a destination.
 */
export function aggregateNormals(series: DailySeries): MonthlyNormal[] {
  const months = Array.from({ length: MONTHS_PER_YEAR }, emptyAccumulator);

  series.time.forEach((stamp, index) => {
    const year = Number(stamp.slice(0, 4));
    const monthIndex = Number(stamp.slice(5, 7)) - 1;

    const bucket = months[monthIndex];
    if (!bucket || !Number.isFinite(year)) return;

    bucket.years.add(year);

    const high = series.highC[index];
    if (high !== null && high !== undefined) {
      bucket.highTotal += high;
      bucket.highCount += 1;
    }

    const low = series.lowC[index];
    if (low !== null && low !== undefined) {
      bucket.lowTotal += low;
      bucket.lowCount += 1;
    }

    const rain = series.precipitationMm[index];
    if (rain !== null && rain !== undefined) bucket.precipTotal += rain;
  });

  return months.map((bucket, monthIndex) => ({
    monthIndex,
    avgHighC: mean(bucket.highTotal, bucket.highCount),
    avgLowC: mean(bucket.lowTotal, bucket.lowCount),
    precipitationMm: mean(bucket.precipTotal, Math.max(1, bucket.years.size)),
  }));
}
