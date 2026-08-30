import { describe, expect, it } from 'vitest';

import { activitiesTitle, BAND_TITLE, isBandTitle } from './band-titles';

/**
 * Whether the document has already printed a heading.
 *
 * The model is asked to recommend a stay, and a recommendation feels like it wants a
 * title — so it writes "## Where to stay" under a band already headed "WHERE TO STAY".
 * This is the check that drops the second one.
 */
describe('isBandTitle', () => {
  it('recognises every band the document prints', () => {
    for (const title of Object.values(BAND_TITLE)) {
      expect(isBandTitle(title)).toBe(true);
    }
  });

  it('ignores case and a trailing colon, which are not differences in a heading', () => {
    expect(isBandTitle('WHERE TO STAY')).toBe(true);
    expect(isBandTitle('Where to stay:')).toBe(true);
  });

  it('recognises an activities band whatever interest it covers', () => {
    expect(isBandTitle(activitiesTitle('food'))).toBe(true);
    expect(isBandTitle(activitiesTitle(null))).toBe(true);
  });

  /** The sections the plan is written to have. Dropping these would lose the heading. */
  it('leaves the plan its own sections', () => {
    expect(isBandTitle('Good to know')).toBe(false);
    expect(isBandTitle('Day 3: Asakusa')).toBe(false);
  });
});
