type ChatErrorProps = {
  /** Already translated into advice by the route; shown verbatim. */
  message: string;
  onRetry: () => void;
};

/**
 * A failed turn, with the way out of it.
 *
 * A ruled note rather than a panel. It used to be a glass card with a red border, which
 * gave the one thing on the page nobody wants to see the heaviest treatment on it — and
 * put a second object on a surface whose whole argument is that there are no objects,
 * only rules.
 *
 * The red stays. It is the one exception to the single-accent rule in this codebase, and
 * it earns it: every other signal here is carried by weight and position, and neither of
 * those can say "this did not work".
 */
export function ChatError({ message, onRetry }: ChatErrorProps) {
  return (
    <div className="flex items-start justify-between gap-4 border-l-2 border-red-500/50 pl-3.5">
      <p role="alert" className="text-[0.8125rem] leading-relaxed text-red-700">
        {message}
      </p>

      <button
        type="button"
        onClick={onRetry}
        className="btn-ghost shrink-0 rounded-full px-3 py-1 text-xs font-medium"
      >
        Retry
      </button>
    </div>
  );
}
