/**
 * The four ways a search-vendor call fails, kept apart because the caller does
 * something different with each.
 *
 * The split that earns its keep is quota versus everything else. A rate limit in
 * the weather pipeline means "wait a second"; a spent allowance here means the
 * month is over, and retrying is both futile and indistinguishable from a bug
 * unless it has its own type. Callers surface it to the model as "I could not
 * check prices", which is the one honest answer available.
 *
 * Each message names the vendor, because with two of them behind one switch an
 * error that says only "quota exhausted" sends a reader to the wrong dashboard.
 */

/** No key configured. A deployment mistake, not a runtime condition. */
export class MissingSerpApiKeyError extends Error {
  override readonly name = 'MissingSerpApiKeyError';

  constructor(keyEnv: string, signupUrl: string) {
    super(`${keyEnv} is not set. Create a key at ${signupUrl} and add it to .env.local`);
  }
}

/** A timeout, a throttle or a server blip: worth retrying, and never worth caching. */
export class TransientSerpApiError extends Error {
  override readonly name = 'TransientSerpApiError';
}

/**
 * The monthly allowance is gone.
 *
 * Deliberately not a subclass of the transient error: the retry loop must not
 * treat this as a blip, and the tool layer must not present a missing price as a
 * free attraction.
 */
export class SerpApiQuotaError extends Error {
  override readonly name = 'SerpApiQuotaError';

  constructor(vendor: string, detail: string) {
    super(`${vendor} quota exhausted: ${detail}`);
  }
}

/** The key was rejected. Permanent until someone changes the environment. */
export class SerpApiAuthError extends Error {
  override readonly name = 'SerpApiAuthError';

  constructor(vendor: string, keyEnv: string, detail: string) {
    super(`${vendor} rejected the API key in ${keyEnv}: ${detail}`);
  }
}
