/**
 * The monthly allowance is gone.
 *
 * The split that earns its keep. A rate limit in the weather pipeline means "wait
 * a second"; a spent allowance here means the month is over, and retrying is both
 * futile and indistinguishable from a bug unless it has its own type. Callers
 * surface it to the model as "I could not check prices", which is the one honest
 * answer available.
 *
 * Deliberately not a subclass of `TransientSerpApiError`: the retry loop must not
 * treat this as a blip, and the tool layer must not present a missing price as a
 * free attraction.
 *
 * The message names the vendor, because with two of them behind one switch an
 * error that says only "quota exhausted" sends a reader to the wrong dashboard.
 */
export class SerpApiQuotaError extends Error {
  override readonly name = 'SerpApiQuotaError';

  constructor(vendor: string, detail: string) {
    super(`${vendor} quota exhausted: ${detail}`);
  }
}
