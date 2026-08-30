import { RouteWait } from './route-wait';

/** How many placeholders a result set usually fills. */
const DEFAULT_COUNT = 3;

function SkeletonLine({ className }: { className?: string }) {
  return <div className={`shimmer h-3 rounded-full ${className ?? ''}`} />;
}

/**
 * Placeholder matching the footprint of a real result, so the layout does not jump
 * when live results replace it.
 *
 * A plate and two lines: the same shape the finished result has, and nothing else.
 * It used to be a glass card with a pill row in it, which meant the waiting state
 * announced a container that the result no longer arrives in.
 */
function SkeletonResult() {
  return (
    <div>
      <div className="shimmer aspect-[4/3] w-full rounded-[var(--radius-glass-sm)]" />
      <div className="mt-3.5 space-y-2.5">
        <SkeletonLine className="w-3/4" />
        <SkeletonLine className="w-1/2 opacity-70" />
      </div>
    </div>
  );
}

type ResultSkeletonProps = {
  /** How many placeholders to draw. Match the grid a real result set fills. */
  count?: number;
  /** What is being waited for, e.g. "Finding places to stay…". */
  label: string;
};

/**
 * Waiting for a tool, in the document's own vocabulary.
 *
 * The label is set on the route track rather than as a sentence, so every wait in
 * the product — a question being answered, a plan being written, a search running —
 * is the same gesture.
 */
export function ResultSkeleton({ count = DEFAULT_COUNT, label }: ResultSkeletonProps) {
  return (
    <div className="space-y-6">
      <RouteWait label={label} />
      <div className="grid gap-x-6 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: count }, (_, index) => (
          <SkeletonResult key={index} />
        ))}
      </div>
    </div>
  );
}
