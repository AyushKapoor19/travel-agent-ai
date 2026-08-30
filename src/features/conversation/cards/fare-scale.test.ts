import { describe, expect, it } from 'vitest';

import type { FareInsight } from '@/features/travel/types';

import { fareScale } from './fare-scale';

function insight(typicalLowUsd: number | null, typicalHighUsd: number | null): FareInsight {
  return { lowestUsd: 610, level: 'high', typicalLowUsd, typicalHighUsd };
}

/**
 * The one piece of arithmetic in the flight band: three fares and a range, placed on a
 * shared scale so the gap between them is visible.
 */
describe('fareScale', () => {
  it('places the band and the fares on one scale', () => {
    const scale = fareScale([940, 1076, 1421], insight(610, 820));
    if (!scale) throw new Error('expected a scale');

    // The cheapest fare is above the band, so the band sits left of every mark.
    expect(scale.band.left).toBeLessThan(scale.marks[0]!);
    expect(scale.marks).toHaveLength(3);
  });

  it('keeps the marks in the order the fares were given', () => {
    const scale = fareScale([940, 1076, 1421], insight(610, 820));
    if (!scale) throw new Error('expected a scale');

    expect(scale.marks).toEqual([...scale.marks].sort((a, b) => a - b));
  });

  it('leaves room at both ends, so no mark is drawn on the edge', () => {
    const scale = fareScale([610, 1421], insight(610, 820));
    if (!scale) throw new Error('expected a scale');

    for (const mark of scale.marks) {
      expect(mark).toBeGreaterThan(0);
      expect(mark).toBeLessThan(100);
    }
  });

  /** A fare below what the route usually costs is the good news, and has to fit. */
  it('holds a fare that undercuts the band', () => {
    const scale = fareScale([420], insight(610, 820));
    if (!scale) throw new Error('expected a scale');

    expect(scale.marks[0]).toBeLessThan(scale.band.left);
  });

  it('gives up when Google reported no range to measure against', () => {
    expect(fareScale([940], insight(null, null))).toBeNull();
    expect(fareScale([940], insight(610, null))).toBeNull();
    expect(fareScale([940], null)).toBeNull();
  });

  /** Nothing to spread across, so a scale would stack every mark in one place. */
  it('gives up when the band and the fare are the same figure', () => {
    expect(fareScale([610], insight(610, 610))).toBeNull();
  });

  it('gives up when there are no fares', () => {
    expect(fareScale([], insight(610, 820))).toBeNull();
  });
});
