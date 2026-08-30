import type { ReactNode } from 'react';

/**
 * A ruled list of figures: fares for a route, or the lines of a total.
 *
 * Both of those were a hand-rolled row inside a glass panel, and the two rows had
 * drifted a padding step apart — which on a page where the fare panel sits directly
 * above the totals panel reads as two different documents. Ruled rows also happen
 * to be how a bill has always been printed, so the metaphor and the deduplication
 * point the same way.
 */
export function Ledger({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-line border-y border-line">{children}</ul>;
}

type LedgerRowProps = {
  label: string;
  /** Everything qualifying the figure: the route, the basis, what was counted. */
  detail?: string;
  amount: string;
};

export function LedgerRow({ label, detail, amount }: LedgerRowProps) {
  return (
    <li className="flex items-baseline justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-[0.8125rem] text-ink">{label}</p>
        {detail && <p className="mt-1 text-[0.6875rem] leading-snug text-ink-muted">{detail}</p>}
      </div>
      <p className="figure shrink-0 text-[0.8125rem] text-ink">{amount}</p>
    </li>
  );
}
