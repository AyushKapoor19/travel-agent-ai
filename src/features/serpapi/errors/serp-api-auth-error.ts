/**
 * The key was rejected. Permanent until someone changes the environment.
 *
 * Names the vendor for the same reason the quota error does: with two of them
 * behind one switch, an unattributed rejection sends a reader to the wrong
 * dashboard.
 */
export class SerpApiAuthError extends Error {
  override readonly name = 'SerpApiAuthError';

  constructor(vendor: string, keyEnv: string, detail: string) {
    super(`${vendor} rejected the API key in ${keyEnv}: ${detail}`);
  }
}
