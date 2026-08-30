import { sleep } from '@/lib/sleep';
import { MS_PER_SECOND } from '@/lib/time';

import {
  PHOTO_BACKOFF_BASE_MS,
  PHOTO_BACKOFF_JITTER_MS,
  PHOTO_CONCURRENCY,
  PHOTO_COOLOFF_MAX_MS,
} from './constants';

/**
 * How hard this process is allowed to lean on Commons.
 *
 * Two mechanisms, both shared across every photograph in flight: a fixed number
 * of slots, and one clock saying when anybody may ask again. Separate from the
 * fetching itself because that is what makes them global — a back-off that each
 * photograph kept privately would just produce N refusals instead of one.
 */

let inFlight = 0;
const waiting: Array<() => void> = [];

export function acquireSlot(): Promise<void> {
  if (inFlight < PHOTO_CONCURRENCY) {
    inFlight += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiting.push(resolve));
}

/** Hands the slot to whoever is waiting rather than freeing and re-taking it. */
export function releaseSlot(): void {
  const next = waiting.shift();
  if (next) next();
  else inFlight -= 1;
}

/**
 * When Commons last refused us, and so when anyone may ask again.
 *
 * Shared, because the budget being spent is ours rather than any one
 * photograph's: a refusal means the next request is going to be refused too,
 * and eight tiles each backing off privately just means eight more refusals.
 * Held as a wall-clock instant rather than a duration so a photograph that
 * waited out someone else's cool-off does not then serve its own.
 */
let refusedUntil = 0;

export async function waitOutRefusal(): Promise<void> {
  for (let wait = refusedUntil - Date.now(); wait > 0; wait = refusedUntil - Date.now()) {
    await sleep(Math.min(wait, PHOTO_COOLOFF_MAX_MS));
  }
}

/**
 * Records a refusal, pushing the shared clock out.
 *
 * @param floorMs A `retry-after` the server asked for, in milliseconds. Backed
 * off on top of rather than obeyed exactly: the header here is a flat second,
 * which is optimistic if the refusal is a budget rather than a queue.
 */
export function backOff(floorMs: number, attempt: number): void {
  const wait = Math.min(
    PHOTO_COOLOFF_MAX_MS,
    Math.max(floorMs, PHOTO_BACKOFF_BASE_MS * 2 ** attempt) +
      Math.random() * PHOTO_BACKOFF_JITTER_MS,
  );
  refusedUntil = Math.max(refusedUntil, Date.now() + wait);
}

/** The `retry-after` on a response, in milliseconds, or zero when absent. */
export function retryAfterMs(response: Response): number {
  const seconds = Number(response.headers.get('retry-after'));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * MS_PER_SECOND : 0;
}
