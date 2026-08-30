import 'server-only';

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { NORMALS_STORE_DEBOUNCE_MS, normalsStorePath } from './constants';
import { normalsWindow } from './normals';
import type { ClimateNormals } from './types';
import { isCompleteYear } from './types';

/**
 * The normals cache, on disk as well as in memory.
 *
 * The in-memory `Map` beside this is the right cache for a request and the wrong
 * one for a process, and the difference cost a day's API allowance. A normal is a
 * ~100 kB download of daily observations, and Open-Meteo prices a request by how
 * much data it moves — a decade of three daily variables counts as roughly 78
 * calls against the free tier's 10,000 a day, so about 128 unseen places. That is
 * ample behind a cache and nothing at all without one.
 *
 * A process-local cache is "without one" for any workflow that restarts the
 * server, which is every development workflow: each restart dropped every city
 * and re-downloaded a decade for it. Next's own fetch cache was absorbing some of
 * that and lives in `.next`, so a `rm -rf .next` took that out too. Thirty-odd
 * restarts later the archive was answering every request with "Daily API request
 * limit exceeded. Please try again tomorrow." — and the destination shortlist,
 * which needs a climate per candidate, had nothing to work with.
 *
 * So this persists somewhere `rm -rf .next` does not reach. It is a cache and
 * behaves like one: unreadable, corrupt or absent is a cold start, never an error,
 * because the worst a failure here may cost is the request it would have saved.
 */

/** Bumped when the stored shape changes, so an old file is ignored rather than parsed. */
const STORE_VERSION = 1;

/**
 * Entries are keyed exactly as the in-memory cache keys them, and the averaging
 * window is stored alongside rather than per entry.
 *
 * The window is what makes a normal immutable: a closed decade of observations is
 * the same decade tomorrow, which is why nothing here expires. It is also the one
 * thing that does change — `normalsWindow` rolls forward every January — and a
 * mismatch discards the file wholesale, which is both correct and simpler than
 * ageing entries out one at a time.
 */
type StoreFile = {
  version: number;
  window: { fromYear: number; toYear: number };
  entries: Record<string, ClimateNormals>;
};

function currentWindow(): StoreFile['window'] {
  const { fromYear, toYear } = normalsWindow();
  return { fromYear, toYear };
}

/**
 * Guards the file against having been hand-edited, truncated mid-write or written
 * by an older build. Cheaper than a schema and checks the things that actually go
 * wrong: the version, the window, and whether a normal still has twelve months.
 */
function readStore(): Map<string, ClimateNormals> {
  const loaded = new Map<string, ClimateNormals>();

  let parsed: StoreFile;
  try {
    parsed = JSON.parse(readFileSync(normalsStorePath(), 'utf8')) as StoreFile;
  } catch {
    return loaded;
  }

  const window = currentWindow();
  if (
    parsed?.version !== STORE_VERSION ||
    parsed.window?.fromYear !== window.fromYear ||
    parsed.window?.toYear !== window.toYear ||
    typeof parsed.entries !== 'object' ||
    parsed.entries === null
  ) {
    return loaded;
  }

  for (const [key, normals] of Object.entries(parsed.entries)) {
    if (normals?.place?.name && Array.isArray(normals.months) && isCompleteYear(normals.months)) {
      loaded.set(key, normals);
    }
  }

  return loaded;
}

let store: Map<string, ClimateNormals> | null = null;

function loaded(): Map<string, ClimateNormals> {
  store ??= readStore();
  return store;
}

/** What was on disk at startup, for the in-memory cache to warm itself from. */
export function persistedNormals(): ReadonlyMap<string, ClimateNormals> {
  return loaded();
}

let pending: ReturnType<typeof setTimeout> | null = null;

/**
 * Writes the whole file rather than appending, debounced.
 *
 * A shortlist resolves five places in a few seconds and each one would otherwise
 * rewrite the file, so the debounce is what keeps this to one write per burst. The
 * file is a few hundred kilobytes at the cache ceiling, which is quicker to
 * serialise than one archive request is to make.
 *
 * Written to a sibling and renamed, because a process killed partway through a
 * write is the normal end of a dev server and a half-written file that parsed
 * would be worse than one that did not.
 */
function flush(): void {
  pending = null;

  const path = normalsStorePath();
  const file: StoreFile = {
    version: STORE_VERSION,
    window: currentWindow(),
    entries: Object.fromEntries(loaded()),
  };

  try {
    mkdirSync(dirname(path), { recursive: true });
    const temporary = `${path}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(file), 'utf8');
    renameSync(temporary, path);
  } catch {
    // A read-only or ephemeral filesystem — a container, a serverless invocation —
    // is a perfectly good place to run without a persistent cache. The in-memory
    // one is unaffected, so there is nothing here worth interrupting a request for.
  }
}

export function persistNormals(key: string, normals: ClimateNormals): void {
  loaded().set(key, normals);

  if (pending) return;
  pending = setTimeout(flush, NORMALS_STORE_DEBOUNCE_MS);
  // Nothing should be kept alive by a cache write.
  pending.unref?.();
}
