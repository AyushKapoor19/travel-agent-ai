/**
 * A failure that says "later" rather than "no".
 *
 * The distinction is what stops a rate limit from being cached as though the
 * place had no climate: a transient failure is retried and never stored, a
 * permanent one is remembered briefly so we stop asking. Same split as the image
 * pipeline, for the same reason.
 */
export class TransientWeatherError extends Error {
  // Annotated rather than inferred so a subclass can name itself. Left as the
  // literal, `QuotaExhaustedError` could not widen it and the one distinction the
  // retry ladder needs would not be expressible as a subclass at all.
  override readonly name: string = 'TransientWeatherError';
}

/**
 * The day's allowance is spent, and no amount of waiting inside this request will
 * bring it back.
 *
 * A subclass because every decision made about a `TransientWeatherError` is still
 * the right one — nothing is cached, and nothing is reported as a fact about the
 * place. Only the retry ladder needs to tell the two apart, and it badly does:
 * Open-Meteo answers both a momentary per-IP collision and an exhausted daily
 * quota with a bare 429, and the ladder treated the second as the first. Five
 * candidates against a spent quota meant twenty more refused requests and a
 * minute of backoff, all to arrive where the first response already said.
 */
export class QuotaExhaustedError extends TransientWeatherError {
  override readonly name = 'QuotaExhaustedError';
}

/** Thrown when a place name cannot be resolved to anywhere on the globe. */
export class UnknownPlaceError extends Error {
  override readonly name = 'UnknownPlaceError';

  constructor(readonly place: string) {
    super(`No coordinates found for "${place}"`);
  }
}
