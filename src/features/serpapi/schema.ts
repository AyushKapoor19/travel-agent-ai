import { z } from 'zod';

/**
 * A number that may arrive as a string, which is the one place the two vendors
 * genuinely disagree about shape rather than about naming.
 *
 * SerpApi types ratings and review counts as JSON numbers. Scrapingdog returns
 * the same Google fields as strings — `"4.7"`, `"762"` — and a schema written
 * against one of them silently rejects every result from the other. Silently is
 * the problem: a failed `safeParse` on the local pack does not raise, it returns
 * an empty list, so the symptom is a destination with no attractions rather than
 * an error anybody can trace back to here.
 *
 * Parsed rather than run through `z.coerce`, because coercion turns `null` and
 * `""` into zero. A zero rating is not a missing rating — it survives the
 * `isUsable` filter, which only checks for `undefined`, and prints on a card as a
 * place everybody hated.
 */
export const numericField = z.preprocess((value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string') return undefined;

  // Review counts above a thousand arrive grouped, e.g. "12,098".
  const text = value.replace(/,/g, '').trim();

  // `Number('')` is zero, which is the exact confusion this helper exists to
  // prevent, so an empty string has to be rejected before it is parsed.
  if (!text) return undefined;

  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}, z.number().optional());
