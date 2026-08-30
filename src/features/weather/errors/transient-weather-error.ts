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
