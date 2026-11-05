import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite-plus';

const generated = [
  'android/**',
  'ios/**',
  '.expo/**',
  'dist/**',
  'coverage/**',
  'modules/*/android/build/**',
  'modules/*/android/.cxx/**',
];

export default defineConfig({
  // Expo uses Metro; Vite+ provides checks and logic tests.
  resolve: {
    alias: {
      '@/assets': fileURLToPath(new URL('./assets', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  lint: {
    ignorePatterns: generated,
    plugins: ['typescript', 'react', 'import', 'unicorn', 'oxc'],
    options: { typeAware: true, typeCheck: true },
    rules: {
      'react/rules-of-hooks': 'error',
      'react/exhaustive-deps': 'error',
      // Types come from generics, annotations and narrowing, never assertions.
      'typescript/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      'typescript/no-non-null-assertion': 'error',
      // React Compiler rules: no derived state, setState in effects/render, impure render, ref misuse.
      ...Object.fromEntries(
        [
          'no-deriving-state-in-effects',
          'set-state-in-effect',
          'set-state-in-render',
          'purity',
          'refs',
          'immutability',
          'static-components',
        ].map((rule) => [`react/${rule}`, 'error']),
      ),
    },
    overrides: [
      {
        // Screens and components compose state; lifecycles live in XState actors, per-frame data in shared values.
        files: ['src/app/**', 'src/components/**'],
        rules: {
          'no-restricted-imports': [
            'error',
            {
              paths: [
                {
                  name: 'react',
                  importNames: ['useEffect', 'useLayoutEffect'],
                  message: 'Use an XState actor for lifecycles; see AGENTS.md.',
                },
              ],
            },
          ],
        },
      },
    ],
  },
  fmt: {
    singleQuote: true,
    ignorePatterns: generated,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    clearMocks: true,
    restoreMocks: true,
  },
});
