/**
 * Next ships declarations for `*.module.css` but not for plain stylesheets, so
 * the one global import in `app/layout.tsx` has no module to resolve to.
 *
 * TypeScript 5.9 — the version `npm run typecheck` runs — exempts side-effect
 * imports from that check, so the build has always been green. Newer language
 * services report it, which is why an editor can flag a line CI is happy with.
 *
 */
declare module '*.css';
