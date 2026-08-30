/**
 * The photo subsystem's HTTP surface, named once.
 *
 * Both endpoints are internal — nothing outside this feature calls them — but
 * the path appears in two places that cannot see each other: the route file's
 * position under `app/`, and the string a component or the client fetches. Named
 * here so moving a route is one edit and a mismatch is a grep away, rather than
 * a photograph that silently stops loading.
 *
 * They must be kept in step with `src/app/api/photos/*` by hand; a directory
 * name is not something TypeScript can check.
 */
export const PhotoRoute = {
  /** Metadata for a set of places: URL, subject, author, licence. */
  LOOKUP: '/api/photos/lookup',
  /** The bytes of one photograph, paced and retried on the way out. */
  FILE: '/api/photos/file',
} as const;
