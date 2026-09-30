import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'Additionals'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // Node scripts (tools/*.mjs) run outside the browser.
    files: ['tools/**/*.mjs'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', URL: 'readonly' },
    },
  },
  {
    // The simulation must stay deterministic (multiplayer seed sync, replays)
    // and must not depend on the browser.
    files: ['src/sim/**/*.ts', 'src/config/**/*.ts', 'src/core/**/*.ts', 'src/replay/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Use a seeded stream from core/rng.ts instead.',
        },
        { object: 'Date', property: 'now', message: 'Use simulation time, not wall-clock time.' },
      ],
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'performance'],
    },
  },
);
