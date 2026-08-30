import { describe, expect, it } from 'vitest';

import { nameKey } from './name-key';

/**
 * The join key three separate features rely on, so the interesting assertions are
 * about which pairs it deliberately does *not* collapse. Over-folding here does not
 * fail loudly: it attaches one hotel's price to another hotel, or a photograph of
 * one landmark to a different one, both of which look like working software.
 */
describe('nameKey', () => {
  it('folds the differences between two sources naming one place', () => {
    expect(nameKey('The Louvre')).toBe(nameKey('Louvre'));
    expect(nameKey('Castelo de São Jorge')).toBe(nameKey('Castelo de Sao Jorge'));
    expect(nameKey('Zürich')).toBe(nameKey('Zurich'));
    expect(nameKey('St. Peter’s Basilica')).toBe(nameKey('St Peters Basilica'));
  });

  it('ignores case, punctuation and spacing', () => {
    expect(nameKey('LX  Factory')).toBe(nameKey('lx-factory'));
    expect(nameKey('Sagrada Família!')).toBe(nameKey('sagrada familia'));
  });

  it('keeps digits, which distinguish real places', () => {
    expect(nameKey('Terminal 2')).not.toBe(nameKey('Terminal 3'));
  });

  it('does not merge distinct places that merely read alike', () => {
    expect(nameKey('Syracuse')).not.toBe(nameKey('Siracusa'));
    expect(nameKey('Independente Principe Real')).not.toBe(nameKey('Independente Rooftop'));
  });

  it('strips only a leading article, not one inside the name', () => {
    expect(nameKey('The Ritz')).toBe('ritz');
    expect(nameKey('Hotel The Ritz')).toBe('hoteltheritz');
  });

  it('reduces a name with nothing comparable in it to empty', () => {
    // Callers must not treat this as a match; an empty key means "no basis to join".
    expect(nameKey('!!!')).toBe('');
    expect(nameKey('')).toBe('');
  });
});
