import { describe, expect, it } from 'vitest';

import { placeNameKey } from './place-name-key';

/**
 * The join key three separate features rely on, so the interesting assertions are
 * about which pairs it deliberately does *not* collapse. Over-folding here does not
 * fail loudly: it attaches one hotel's price to another hotel, or a photograph of
 * one landmark to a different one, both of which look like working software.
 */
describe('placeNameKey', () => {
  it('folds the differences between two sources naming one place', () => {
    expect(placeNameKey('The Louvre')).toBe(placeNameKey('Louvre'));
    expect(placeNameKey('Castelo de São Jorge')).toBe(placeNameKey('Castelo de Sao Jorge'));
    expect(placeNameKey('Zürich')).toBe(placeNameKey('Zurich'));
    expect(placeNameKey('St. Peter’s Basilica')).toBe(placeNameKey('St Peters Basilica'));
  });

  it('ignores case, punctuation and spacing', () => {
    expect(placeNameKey('LX  Factory')).toBe(placeNameKey('lx-factory'));
    expect(placeNameKey('Sagrada Família!')).toBe(placeNameKey('sagrada familia'));
  });

  it('keeps digits, which distinguish real places', () => {
    expect(placeNameKey('Terminal 2')).not.toBe(placeNameKey('Terminal 3'));
  });

  it('does not merge distinct places that merely read alike', () => {
    expect(placeNameKey('Syracuse')).not.toBe(placeNameKey('Siracusa'));
    expect(placeNameKey('Independente Principe Real')).not.toBe(
      placeNameKey('Independente Rooftop'),
    );
  });

  it('strips only a leading article, not one inside the name', () => {
    expect(placeNameKey('The Ritz')).toBe('ritz');
    expect(placeNameKey('Hotel The Ritz')).toBe('hoteltheritz');
  });

  it('reduces a name with nothing comparable in it to empty', () => {
    // Callers must not treat this as a match; an empty key means "no basis to join".
    expect(placeNameKey('!!!')).toBe('');
    expect(placeNameKey('')).toBe('');
  });
});
