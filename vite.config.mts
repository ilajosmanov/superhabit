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
  'src/storage/migrations/**',
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

/** Exercises are pure rep logic: no framework, feature, UI or storage. */
const EXERCISES_BANS = [
  ...FRAMEWORKS,
  '@/app/**',
  '@/bootstrap/**',
  '@/friends/**',
  '@/challenges/**',
  '@/streak/**',
  '@/workout/**',
  '@/components/**',
  '@/theme',
  '@/storage/**',
];
const POSE_TYPES_ONLY = {
  name: 'superhabit-pose',
  allowTypeImports: true,
  message: 'Pose types only: the detector is native.',
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
            ? [{ group: banned, message: 'Layer ban; see CODING_STANDARDS.md.' }]
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
      // A `// comment` between JSX tags renders as text.
      'react/jsx-no-comment-textnodes': 'error',
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
      // Layers, each importing only those below it: app (routes) → bootstrap (the app's start) → friends,
      // challenges (the catalog; its views in components/), streak → workout (session; its views in components/
      // and pose/) → exercises (pure rep logic) → components/ (shared UI), theme, storage/ (the phone's
      // database; no UI, no feature rules).
      // An override replaces the rule's options, so each one repeats what still applies to its files.
      layer(['src/app/**'], [], [NO_EFFECTS]),
      // The app's start: above every feature, below the routes.
      layer(['src/bootstrap/**'], ['@/app/**']),
      // A feature's components/ and pose/ are its own UI: only routes may compose them with another's.
      layer(
        ['src/friends/**'],
        [
          '@/app/**',
          '@/bootstrap/**',
          '@/challenges/components/**',
          '@/streak/components/**',
          '@/workout/components/**',
          '@/workout/pose/**',
        ],
        [NO_EFFECTS],
      ),
      layer(
        ['src/challenges/components/**'],
        [
          '@/app/**',
          '@/bootstrap/**',
          '@/friends/**',
          '@/streak/components/**',
          '@/workout/components/**',
          '@/workout/pose/**',
        ],
        [NO_EFFECTS],
      ),
      layer(
        ['src/challenges/*.{ts,tsx}'],
        [
          '@/app/**',
          '@/bootstrap/**',
          '@/friends/**',
          '@/challenges/components/**',
          '@/streak/components/**',
          '@/workout/components/**',
          '@/workout/pose/**',
        ],
      ),
      // The streak: rules and freeze events in *.ts, Home's grid in components/.
      layer(
        ['src/streak/components/**'],
        [
          '@/app/**',
          '@/bootstrap/**',
          '@/friends/**',
          '@/challenges/components/**',
          '@/workout/components/**',
          '@/workout/pose/**',
        ],
        [NO_EFFECTS],
      ),
      layer(
        ['src/streak/*.ts'],
        [
          '@/app/**',
          '@/bootstrap/**',
          '@/friends/**',
          '@/challenges/components/**',
          '@/streak/components/**',
          '@/workout/components/**',
          '@/workout/pose/**',
        ],
      ),
      layer(
        ['src/workout/components/**', 'src/workout/pose/**'],
        ['@/app/**', '@/bootstrap/**', '@/friends/**', '@/challenges/**', '@/streak/**'],
        [NO_EFFECTS],
      ),
      layer(
        [
          'src/workout/*.ts',
          'src/workout/plan/**',
          'src/workout/session/**',
          'src/workout/capture/**',
          'src/workout/coach/**',
        ],
        [
          '@/app/**',
          '@/bootstrap/**',
          '@/friends/**',
          '@/challenges/**',
          '@/streak/**',
          '@/workout/components/**',
          '@/workout/pose/**',
        ],
      ),
      layer(['src/exercises/**'], EXERCISES_BANS, [POSE_TYPES_ONLY]),
      // Test code replays recorded sets, so it reads the trace file format.
      layer(
        ['src/exercises/__fixtures__/**'],
        [...EXERCISES_BANS, '!@/storage/trace-file'],
        [POSE_TYPES_ONLY],
      ),
      layer(
        ['src/components/**', 'src/theme.ts'],
        [
          '@/app/**',
          '@/bootstrap/**',
          '@/friends/**',
          '@/challenges/**',
          '@/streak/**',
          '@/workout/**',
          '@/exercises/**',
          '@/storage/**',
        ],
        [NO_EFFECTS],
      ),
      layer(
        ['src/storage/**'],
        [
          'react-native',
          '@/app/**',
          '@/bootstrap/**',
          '@/friends/**',
          '@/challenges/**',
          '@/streak/**',
          '@/workout/**',
          '@/exercises/**',
          '@/components/**',
          '@/theme',
        ],
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
    // A zone east of UTC with summer time, so local-day and DST bugs fail here as they would on a phone.
    env: { TZ: 'Europe/Tallinn' },
    include: ['src/**/*.test.ts'],
    clearMocks: true,
    restoreMocks: true,
  },
});
