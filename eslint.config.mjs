import { FlatCompat } from '@eslint/eslintrc';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

/**
 * Import order, most distant to most local. The groups are explicit rather than
 * left to the plugin's default so that `react`, `next` and the `@/` alias each
 * land in a predictable band instead of being sorted in with npm packages.
 */
const IMPORT_GROUPS = [
  ['^\\u0000'],
  ['^react$', '^react/', '^next$', '^next/'],
  ['^@?\\w'],
  ['^@/'],
  ['^\\.\\.'],
  ['^\\./'],
  ['^.+\\.css$'],
];

/**
 * The layering, enforced rather than described.
 *
 * `features/` may reach down into `components/` and `lib/`; neither may reach
 * back up. A shared primitive that knows about a trip brief is no longer shared,
 * and the drift towards that happens one convenient import at a time — exactly
 * the kind of thing a reviewer waves through and a linter does not.
 */
const LAYERING = [
  {
    files: ['src/components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/features/*', '@/features/**'],
              message:
                'components/ is shared by every feature and must not depend on one. Move the feature-specific part into that feature, or take it as a prop.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/lib/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/features/*', '@/features/**', '@/components/*', '@/components/**'],
              message:
                'lib/ is the bottom layer: formatting, durations, cache headers, design tokens. Anything that needs a feature or a component belongs in that feature.',
            },
          ],
        },
      ],
    },
  },
];

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    plugins: { 'simple-import-sort': simpleImportSort },
    rules: {
      'simple-import-sort/imports': ['error', { groups: IMPORT_GROUPS }],
      'simple-import-sort/exports': 'error',

      // A type-only import that looks like a value import is a runtime import
      // the bundler cannot drop, and reads as a dependency the module does not
      // actually have.
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // A cycle is what a feature-sliced tree drifts into once two slices start
      // reaching for each other, and it fails as a module that is briefly
      // `undefined` at import time — a class of bug that reads as anything but an
      // import problem. There are none today; this is what keeps that true.
      'import/no-cycle': ['error', { maxDepth: Infinity, ignoreExternal: true }],

      eqeqeq: ['error', 'smart'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'object-shorthand': ['error', 'always'],
      'prefer-const': 'error',
      'prefer-template': 'error',
    },
  },
  ...LAYERING,
  {
    // The evals are a command-line reporter, so printing is the whole job. Warning
    // about it here trains the eye to skip a lint run that has real findings in it.
    files: ['evals/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    ignores: ['node_modules/**', '.next/**', 'out/**', 'build/**', 'next-env.d.ts'],
  },
];

export default eslintConfig;
