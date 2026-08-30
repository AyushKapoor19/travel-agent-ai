import type { ClimateReport } from '@/features/weather/shared';
import { cn } from '@/lib/cn';

import { AsideNote } from './band';

/**
 * A place's climate, drawn rather than paraphrased.
 *
 * `get_weather` was the one real data source with nothing rendered for it: the
 * model called it, wrote a sentence from the travel month, and the other eleven
 * months went in the bin. They are the answer to the question travellers actually
 * ask next — "so when should I go?" — and they were already in the payload, so the
 * strip costs a lookup of nothing.
 *
 * Deliberately not a plate in the result grid. A stay or an activity is one of
 * several and competes for a choice; a climate is singular, and a year reads as a
 * row rather than as a tile.
 */

/** Floor, so a month below the scale still shows a bar rather than nothing. */
const MIN_BAR_PERCENT = 8;

/**
 * The range the strip is drawn against, in °C — fixed, not per place.
 *
 * Scaling each place to its own hottest and coldest month was the first attempt and
 * it lied twice. Singapore's year runs 28–31°C, so two degrees got stretched across
 * the full height and read as dramatic seasonal swing; clamping the range instead
 * squashed all twelve bars into the bottom quarter, which reads as a cold city. Both
 * are wrong because the height was encoding rank within the year rather than
 * temperature.
 *
 * Against a fixed scale a bar means the same thing everywhere: Singapore is a flat
 * row of tall bars, Reykjavík a flat row of short ones, Lisbon an arc between. The
 * bounds cover the inhabited range with enough room that ordinary cities are not
 * pinned to either end.
 */
const SCALE_MIN_C = -5;
const SCALE_MAX_C = 40;

function barPercent(avgHighC: number): number {
  const ratio = (avgHighC - SCALE_MIN_C) / (SCALE_MAX_C - SCALE_MIN_C);
  return Math.min(100, Math.max(MIN_BAR_PERCENT, ratio * 100));
}

type WeatherCardProps = {
  report: ClimateReport;
};

export function WeatherCard({ report }: WeatherCardProps) {
  const { place, country, month, year, bestMonths, source } = report;
  const best = new Set(bestMonths);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[0.9375rem] font-semibold tracking-[-0.015em] text-ink">
          {place}
          <span className="ml-2 text-xs font-normal tracking-normal text-ink-muted">{country}</span>
        </p>

        {month && (
          <p className="figure text-[0.8125rem] text-ink-soft">
            <span className="text-ink">{month.month}</span> · {Math.round(month.avgHighC)}°/
            {Math.round(month.avgLowC)}° · {month.rain}
          </p>
        )}
      </div>

      {/* Bars grown from the baseline the initials sit on, so the strip reads as a
          year on an axis rather than as twelve objects. */}
      <ul className="mt-4 flex h-16 items-end gap-1 border-b border-line">
        {year.map((entry) => {
          const isTravelMonth = entry.month === month?.month;
          const isBest = best.has(entry.month);

          return (
            <li
              key={entry.month}
              className="flex h-full flex-1 flex-col justify-end"
              title={`${entry.month} · ${Math.round(entry.avgHighC)}° / ${Math.round(entry.avgLowC)}° · ${entry.rain}`}
              aria-label={`${entry.month}: high ${Math.round(entry.avgHighC)} degrees, low ${Math.round(entry.avgLowC)}, ${entry.rain}`}
            >
              <div
                className={cn(
                  'w-full transition-colors',
                  isTravelMonth ? 'bg-accent' : isBest ? 'bg-ink/28' : 'bg-ink/10',
                )}
                style={{ height: `${barPercent(entry.avgHighC)}%` }}
              />
            </li>
          );
        })}
      </ul>

      <ul className="mt-1.5 flex gap-1" aria-hidden>
        {year.map((entry) => (
          <li
            key={entry.month}
            className={cn(
              'figure flex-1 text-center text-[0.625rem] leading-none',
              entry.month === month?.month
                ? 'text-ink'
                : best.has(entry.month)
                  ? 'text-ink-soft'
                  : 'text-ink-muted',
            )}
          >
            {entry.month.charAt(0)}
          </li>
        ))}
      </ul>

      {bestMonths.length > 0 && (
        <p className="mt-4 text-xs text-ink-soft">
          <span className="label text-ink-muted">Best months</span>
          <span className="ml-2.5">{bestMonths.join(' · ')}</span>
        </p>
      )}

      {/* The provenance is the difference between a measurement and a claim, and it
          is the whole reason the model is forbidden from answering this from memory. */}
      <p className="mt-1.5 text-[0.6875rem] leading-snug text-ink-muted/70">{source}</p>
    </div>
  );
}

/**
 * What is shown when a place could not be resolved.
 *
 * A real outcome rather than an error: the geocoder does not know every name, and
 * the honest response is to say the weather is unconfirmed. Rendering nothing would
 * leave the model's prose as the only account of it, which is exactly the source
 * we do not trust for weather.
 */
export function WeatherUnavailable({ place }: { place: string }) {
  return (
    <AsideNote>
      Couldn&apos;t confirm the weather for {place} — no climate record came back, so nothing below
      quotes one.
    </AsideNote>
  );
}
