/** Thrown when a place name cannot be resolved to anywhere on the globe. */
export class UnknownPlaceError extends Error {
  override readonly name = 'UnknownPlaceError';

  constructor(readonly place: string) {
    super(`No coordinates found for "${place}"`);
  }
}
