/**
 * Thrown when the call may succeed later, so the result must not be cached.
 *
 * The distinction this draws is the whole reason it exists: a rate limit means
 * "ask again", and a 404 means "there is no photograph". Recording the first as
 * the second is what turns one throttled minute into a place that has no picture
 * for the rest of the day.
 */
export class TransientImageError extends Error {
  override readonly name = 'TransientImageError';
}

export function isTransient(error: unknown): error is TransientImageError {
  return error instanceof TransientImageError;
}
