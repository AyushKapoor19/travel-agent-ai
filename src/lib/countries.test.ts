import { describe, expect, it } from 'vitest';

import { sameCountry, shortCountryName } from './countries';

/**
 * These are regression tests before they are unit tests.
 *
 * Every case in the first block is a destination this app actually threw away. The
 * failure was silent by construction — a candidate that cannot be confirmed is
 * dropped, so the symptom was a shortlist of two where three were expected, with
 * nothing in a log to say why. That is the kind of bug a test has to hold shut,
 * because nobody will notice it coming back.
 */

describe('sameCountry', () => {
  it('matches the official English name against what a traveller would say', () => {
    // Fethiye died here: the geocoder returns the official form, the model writes
    // the common one, and a string comparison called Turkey the wrong country.
    expect(sameCountry('Republic of Türkiye', 'Turkey')).toBe(true);
    expect(sameCountry('Türkiye', 'Turkey')).toBe(true);
    expect(sameCountry('Turkey', 'Türkiye')).toBe(true);
  });

  it('reads a country out of a hint written as prose', () => {
    // Chania died here: the field asked for a country and the model gave an address.
    expect(sameCountry('Greece', 'Chania, Crete, Greece')).toBe(true);
    expect(sameCountry('Italy', 'Sicily, Italy')).toBe(true);
  });

  it('folds accents and articles so equal names compare equal', () => {
    expect(sameCountry('Netherlands', 'The Netherlands')).toBe(true);
    expect(sameCountry('Holland', 'Netherlands')).toBe(true);
    expect(sameCountry('Czechia', 'Czech Republic')).toBe(true);
  });

  it('accepts the constituent countries of the UK', () => {
    // A model asked for the country of Edinburgh says Scotland, and is not wrong.
    expect(sameCountry('United Kingdom', 'Scotland')).toBe(true);
    expect(sameCountry('United Kingdom', 'England')).toBe(true);
  });

  it('strips a form-of-state prefix it has no alias for', () => {
    expect(sameCountry('Kingdom of Morocco', 'Morocco')).toBe(true);
    expect(sameCountry('Republic of Colombia', 'Colombia')).toBe(true);
  });

  /**
   * The half that matters more. A comparison that returns true too readily does not
   * drop good candidates, it verifies bad ones — and a wrong country reaching the
   * card means the weather, the rates and the photograph are all for the wrong place.
   */
  it('still says no when the countries genuinely differ', () => {
    expect(sameCountry('Mexico', 'Greece')).toBe(false);
    expect(sameCountry('India', 'Indonesia')).toBe(false);
    expect(sameCountry('Austria', 'Australia')).toBe(false);
    expect(sameCountry('Ireland', 'Iceland')).toBe(false);
  });

  it('does not confuse the two Congos or the two Koreas', () => {
    expect(sameCountry('Republic of the Congo', 'Democratic Republic of the Congo')).toBe(false);
    expect(sameCountry('South Korea', 'North Korea')).toBe(false);
  });

  it('does not let "United States of America" match through to the United Kingdom', () => {
    // The reason "United" is not a strippable adjective: doing so would reduce this
    // to "America" and the UK to "Kingdom", and one of those collides.
    expect(sameCountry('United States of America', 'United Kingdom')).toBe(false);
  });

  it('treats an unknown or empty country as unconfirmed rather than as a match', () => {
    expect(sameCountry(undefined, 'Greece')).toBe(false);
    expect(sameCountry('', 'Greece')).toBe(false);
    expect(sameCountry('Greece', '')).toBe(false);
  });
});

describe('shortCountryName', () => {
  it('gives the name a traveller would recognise', () => {
    expect(shortCountryName('Republic of Türkiye')).toBe('Turkey');
    expect(shortCountryName('Czechia')).toBe('Czech Republic');
    expect(shortCountryName('Hellenic Republic')).toBe('Greece');
  });

  it('strips a form-of-state prefix even with no alias entry', () => {
    expect(shortCountryName('Kingdom of Morocco')).toBe('Morocco');
    expect(shortCountryName('Republic of the Philippines')).toBe('Philippines');
  });

  it('leaves an ordinary name untouched', () => {
    expect(shortCountryName('Portugal')).toBe('Portugal');
    expect(shortCountryName('  Japan  ')).toBe('Japan');
  });

  it('returns an empty string rather than throwing on empty input', () => {
    expect(shortCountryName('')).toBe('');
    expect(shortCountryName('   ')).toBe('');
  });
});
