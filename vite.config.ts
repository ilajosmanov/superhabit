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

/** Native and UI frameworks pure logic must not touch. */
const FRAMEWORKS = [
  'react',
  'react-native',
  'react-native-*',
  'expo',
  'expo-*',
  '@expo/*',
  '@shopify/*',
  'xstate',
];

// Screens and views compose state; lifecycles live in XState actors, per-frame data in shared values.
const NO_EFFECTS = {
  name: 'react',
  importNames: ['useEffect', 'useLayoutEffect'],
  message: 'Use an XState actor for lifecycles; see AGENTS.md.',
};

/** `files` may import neither `banned` nor `paths`; no file climbs out of its folder with `../`, so bans hold. */
const layer = (
  files: string[],
  banned: string[],
  paths: object[] = [],
): { files: string[]; rules: Record<string, ['error', unknown]> } => ({
  files,
  rules: {
    'no-restricted-imports': [
      'error',
      {
        paths,
        patterns: [
          { regex: '^\\.\\./', message: "Import across folders with '@/'." },
          ...(banned.length
            ? [{ group: banned, message: 'Imports go down the layers; see vite.config.ts.' }]
            : []),
        ],
      },
    ],
  },
});

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
      // Type-only cycles too: they show a contract owned by the wrong module.
      'import/no-cycle': ['error', { ignoreTypes: false }],
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
      // Layers, each importing only those below it: app (routes) → workout (session; its views in
      // components/ and pose/) → exercises (pure rep logic) → components/ (shared UI), theme.
      // An override replaces the rule's options, so each one repeats what still applies to its files.
      layer(['src/app/**'], [], [NO_EFFECTS]),
      layer(['src/workout/components/**', 'src/workout/pose/**'], ['@/app/**'], [NO_EFFECTS]),
      layer(['src/workout/*.ts'], ['@/app/**', '@/workout/components/**', '@/workout/pose/**']),
      layer(
        ['src/exercises/**'],
        [...FRAMEWORKS, '@/app/**', '@/workout/**', '@/components/**', '@/theme'],
        [
          {
            name: 'superhabit-pose',
            allowTypeImports: true,
            message: 'Pose types only: the detector is native.',
          },
        ],
      ),
      layer(
        ['src/components/**', 'src/theme.ts'],
        ['@/app/**', '@/workout/**', '@/exercises/**'],
        [NO_EFFECTS],
      ),
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
