import type { ReactNode } from 'react';

import { Band } from './band';

type ResultGridProps = {
  title: string;
  /**
   * Plates per row at the widest breakpoint.
   *
   * Three for stays and activities, which carry a line of meta and a price. Two
   * for destinations, which carry their reasons and highlights as well — at three
   * across, those lists wrap to a word a line.
   */
  columns?: 2 | 3;
  children: ReactNode;
};

const COLUMN_CLASS = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
} as const;

/**
 * A set of results, as a band of plates.
 *
 * Gutters rather than gaps: with no card outline the space between two plates is
 * the only thing separating them, so it is wider than the 12px that used to sit
 * between two rimmed cards.
 */
export function ResultGrid({ title, columns = 3, children }: ResultGridProps) {
  return (
    <Band title={title}>
      <div className={`grid gap-x-6 gap-y-9 ${COLUMN_CLASS[columns]}`}>{children}</div>
    </Band>
  );
}
