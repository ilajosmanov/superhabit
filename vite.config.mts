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
  'server/worker-configuration.d.ts',
  'server/.wrangler/**',
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
  '@/account/**',
  '@/leaderboard/**',
  '@/challenges/**',
  '@/streak/**',
  '@/workout/**',
  '@/components/**',
  '@/theme',
  '@/storage/**',
];
const POSE_TYPES_ONLY = {
  name: 'reprepgo-pose',
  allowTypeImports: true,
  message: 'Pose types only: the detector is native.',
};

/** Server layers (`server/src`): `files` may not import the `banned` modules. Relative imports, no alias. */
const serverLayer = (
  files: string[],
  banned: string[],
  message: string,
): { files: string[]; rules: Record<string, ['error', unknown]> } => ({
  files,
  rules: {
    'no-restricted-imports': [
      'error',
      { patterns: [{ group: banned, message, allowTypeImports: true }] },
    ],
  },
});

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
      // Layers, each importing only those below it: app (routes) → bootstrap (the app's start) → account,
      // leaderboard,
      // challenges (the catalog; its views in components/), streak → workout (session; its views in components/
      // and pose/) → exercises (pure rep logic) → components/ (shared UI), theme, storage/ (the phone's
      // database; no UI, no feature rules) → lib/ (small focused libraries: text, durations).
      // An override replaces the rule's options, so each one repeats what still applies to its files.
      layer(['src/app/**'], [], [NO_EFFECTS]),
      // The app's start: above every feature, below the routes.
      layer(['src/bootstrap/**'], ['@/app/**']),
      // A feature's components/ and pose/ are its own UI: only routes may compose them with another's.
      layer(
        ['src/leaderboard/**'],
        [
          '@/app/**',
          '@/bootstrap/**',
          '@/account/components/**',
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
          '@/account/components/**',
          '@/leaderboard/**',
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
          '@/account/components/**',
          '@/leaderboard/**',
          '@/challenges/components/**',
          '@/streak/components/**',
          '@/workout/components/**',
          '@/workout/pose/**',
        ],
      ),
      // Your account: sign-in and the session in *.ts, the sign-in screen in components/. Only bootstrap and
      // routes are above it.
      layer(
        ['src/account/**'],
        [
          '@/app/**',
          '@/bootstrap/**',
          '@/leaderboard/**',
          '@/challenges/**',
          '@/streak/**',
          '@/workout/**',
        ],
        [NO_EFFECTS],
      ),
      // The streak: rules and freeze events in *.ts, Home's grid in components/.
      layer(
        ['src/streak/components/**'],
        [
          '@/app/**',
          '@/bootstrap/**',
          '@/account/components/**',
          '@/leaderboard/**',
          '@/challenges/components/**',
          '@/workout/components/**',
          '@/workout/pose/**',
        ],
        [NO_EFFECTS],
      ),
      layer(
        ['src/streak/*.{ts,tsx}'],
        [
          '@/app/**',
          '@/bootstrap/**',
          '@/account/components/**',
          '@/leaderboard/**',
          '@/challenges/components/**',
          '@/streak/components/**',
          '@/workout/components/**',
          '@/workout/pose/**',
        ],
      ),
      layer(
        ['src/workout/components/**', 'src/workout/pose/**'],
        [
          '@/app/**',
          '@/bootstrap/**',
          '@/account/**',
          '@/leaderboard/**',
          '@/challenges/**',
          '@/streak/**',
        ],
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
          '@/account/**',
          '@/leaderboard/**',
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
          '@/account/**',
          '@/leaderboard/**',
          '@/challenges/**',
          '@/streak/**',
          '@/workout/**',
          '@/exercises/**',
          '@/storage/**',
        ],
        [NO_EFFECTS],
      ),
      // Small focused libraries under every layer: plain TypeScript that imports nothing of ours.
      layer(
        ['src/lib/**'],
        [
          ...FRAMEWORKS,
          '@/app/**',
          '@/bootstrap/**',
          '@/account/**',
          '@/leaderboard/**',
          '@/challenges/**',
          '@/streak/**',
          '@/workout/**',
          '@/exercises/**',
          '@/components/**',
          '@/theme',
          '@/storage/**',
        ],
      ),
      layer(
        ['src/storage/**'],
        [
          'react-native',
          '@/app/**',
          '@/bootstrap/**',
          '@/account/**',
          '@/leaderboard/**',
          '@/challenges/**',
          '@/streak/**',
          '@/workout/**',
          '@/exercises/**',
          '@/components/**',
          '@/theme',
        ],
        [NO_EFFECTS],
      ),
      // The server, feature by feature: routes.ts (HTTP: input, status codes) → store.ts (rules and queries)
      // → db/ (tables and the connection). Types may cross.
      serverLayer(
        ['server/src/**/routes.ts'],
        ['drizzle-orm', 'drizzle-orm/*', '**/db/schema', '**/db/auth-schema'],
        'Queries live in store.ts.',
      ),
      serverLayer(
        ['server/src/**/store.ts'],
        ['hono', 'hono/*', '**/routes'],
        'HTTP stays in routes.ts.',
      ),
      serverLayer(
        ['server/src/db/**'],
        ['hono', 'hono/*', '**/routes', '**/store', '**/auth/*'],
        'db/ is the bottom layer.',
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
    include: ['src/**/*.test.ts', 'server/src/**/*.test.ts'],
    clearMocks: true,
    restoreMocks: true,
  },
});
