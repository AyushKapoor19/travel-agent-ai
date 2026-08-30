/** No key configured. A deployment mistake, not a runtime condition. */
export class MissingSerpApiKeyError extends Error {
  override readonly name = 'MissingSerpApiKeyError';

  constructor(keyEnv: string, signupUrl: string) {
    super(`${keyEnv} is not set. Create a key at ${signupUrl} and add it to .env.local`);
  }
}
