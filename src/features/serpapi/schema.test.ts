import { describe, expect, it } from 'vitest';

import { numericField } from './schema';

/**
 * The one field shape the two vendors disagree about, and the reason the
 * disagreement is worth a test: a schema that rejects a vendor's ratings does not
 * raise, it drops the whole result list, so the symptom is a destination with no
 * attractions rather than an error pointing anywhere near here.
 */
describe('numericField', () => {
  it('accepts the number SerpApi sends', () => {
    expect(numericField.parse(4.7)).toBe(4.7);
    expect(numericField.parse(0)).toBe(0);
  });

  it('accepts the string Scrapingdog sends for the same field', () => {
    expect(numericField.parse('4.7')).toBe(4.7);
    expect(numericField.parse('762')).toBe(762);
  });

  it('reads a grouped review count', () => {
    expect(numericField.parse('12,098')).toBe(12098);
  });

  it('leaves an absent field absent', () => {
    expect(numericField.parse(undefined)).toBeUndefined();
  });

  it('does not turn a missing rating into a zero one', () => {
    // The reason this is parsed rather than coerced. `isUsable` only filters on
    // `undefined`, so a zero here would survive and print as a place everybody
    // hated rather than one nobody rated.
    expect(numericField.parse(null)).toBeUndefined();
    expect(numericField.parse('')).toBeUndefined();
    expect(numericField.parse('unrated')).toBeUndefined();
  });

  it('rejects a number that is not one', () => {
    expect(numericField.parse(Number.NaN)).toBeUndefined();
    expect(numericField.parse(Number.POSITIVE_INFINITY)).toBeUndefined();
  });
});
