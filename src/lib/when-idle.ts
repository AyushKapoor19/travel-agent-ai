/**
 * Runs work once the browser has nothing better to do.
 *
 * @returns A cancel function, safe to call after the task has run.
 */
export type WhenIdleOptions = {
  /** Longest the browser may hold the task back before running it anyway. */
  timeoutMs: number;
  /** Flat delay used where `requestIdleCallback` is unavailable. */
  fallbackDelayMs: number;
};

export function whenIdle(
  task: () => void,
  { timeoutMs, fallbackDelayMs }: WhenIdleOptions,
): () => void {
  // Probed as a property rather than aliased and tested for truthiness. The DOM
  // types declare it as always present, so a `const idle = window.…` alias
  // narrows straight back to "defined" and the compiler reads the guards below
  // as dead code. Safari only shipped this in 17; they are not.
  const supported = 'requestIdleCallback' in window;

  if (!supported) {
    const timer = window.setTimeout(task, fallbackDelayMs);
    return () => window.clearTimeout(timer);
  }

  const handle = window.requestIdleCallback(task, { timeout: timeoutMs });
  return () => window.cancelIdleCallback(handle);
}
