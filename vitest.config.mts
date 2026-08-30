import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Two settings here are load-bearing and neither is obvious.
 *
 * `conditions: ['react-server']` is what lets a test import a module guarded by
 * `server-only`. That package is a deliberate booby trap: its default entry throws
 * on import so a server module cannot reach a client bundle, and its `react-server`
 * export is empty. Without this, importing the cost or weather modules fails before
 * a single assertion runs — and the fix is emphatically not to drop the guards,
 * which are the thing keeping provider keys out of the browser.
 *
 * The alias is written out rather than read from `tsconfig.json` by a plugin. There
 * is exactly one of them, and the plugin that would infer it is ESM-only, which
 * fails while this config is loaded as CommonJS. A dependency and a build-format
 * problem to save one line is a poor trade.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
    conditions: ['react-server'],
  },
  // Tests are transformed through the SSR pipeline, which resolves conditions
  // separately — setting only the pair above leaves `server-only` throwing.
  ssr: {
    resolve: {
      conditions: ['react-server'],
    },
  },
  test: {
    // Unit tests only. The evals talk to a live model and are run on purpose, by
    // `npm run eval`, so `npm test` stays offline, deterministic and free.
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
