import { sleep } from './sleep';

/**
 * The two ways this app keeps itself inside somebody else's rate limit.
 *
 * They are kept side by side because the choice between them is the whole
 * decision, and it is not obvious from a call site which one a given upstream
 * needs. A start-stagger spaces out when calls *begin* and lets them overlap; a
 * serializer holds each one until its predecessor has *finished*. Written out
 * separately in three features, that distinction was invisible, and the wrong
 * one had already been picked once.
 */

/**
 * Spaces out the start of outbound calls, process-wide.
 *
 * Callers still run concurrently; only their starts are staggered, which keeps a
 * batch of lookups well inside a per-second limit without queueing the whole
 * batch behind each round trip. The right choice when the upstream throttles by
 * rate rather than by concurrency.
 *
 * The chain swallows rejections so one failed turn cannot strand every caller
 * behind it.
 */
export function createStartStagger(gapMs: number): () => Promise<void> {
  let chain: Promise<void> = Promise.resolve();

  return () => {
    const turn = chain.then(() => sleep(gapMs));
    chain = turn.catch(() => {});
    return turn;
  };
}

/**
 * One outbound call at a time, process-wide, with a pause between them.
 *
 * The right choice when the upstream allows a fixed number of *concurrent*
 * requests rather than a rate — staggered starts still put several calls in one
 * slot, and the overflow comes back as soft failures that read like real answers.
 *
 * Wrap only the request itself. Anything slow held inside the turn idles the one
 * slot every other caller is waiting for.
 */
export function createRequestSerializer(gapMs: number): <T>(task: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();

  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task, task);
    tail = run.then(() => sleep(gapMs)).catch(() => sleep(gapMs));
    return run;
  };
}
