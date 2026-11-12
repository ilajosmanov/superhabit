# Coding standards

How Superhabit is laid out and why. `AGENTS.md` holds the tooling and React rules; this file holds the
architecture. Lint (`vite.config.mts`) enforces most of it, so `vp check` fails when the code drifts.

## Layers

Imports only go down:

```
src/app/            routes: read params, compose a screen, navigate
  ↓
src/bootstrap/      the app's start: the splash, database, sign-in, seeding, recovery, and today
  ↓
src/account/        signing in with Google and the session with our server; the sign-in screen in components/
src/leaderboard/    the weekly leagues: your board, and whether others see your name
src/challenges/     the challenge catalog: definitions, catalog entries, your library (challenges and runs
                    kept on the phone), run progress, the reel of a session's sets
  components/       UI only challenges uses (catalog tiles, joined cards, the Done page and its reel)
src/streak/         your streak: its rules, the freeze events kept, and Home's grid in components/
  ↓
src/workout/        the workout feature: store, log actor and recovery
  plan/             plan model and result contracts
  session/          session machine, counting, framing and orientation
  capture/          trace recorder, camcorder and their in-flight writes
  coach/            phrases and speech
  components/       UI only workout uses (platters, gauge, controls)
  pose/             camera → pose detection → skeleton drawing
  ↓
src/exercises/      pure rep logic: angles, counters, the exercise registry
  ↓
src/components/     UI shared by every screen (icons, screen shell, buttons)
src/theme.ts        the dark and light palettes for APIs that take values (read with useColors()); classes come from src/global.css
src/storage/        what is kept on the phone and how: the SQLite tables, migrations, outbox; no UI
  ↓
src/lib/            small focused libraries (FSD's shared/lib): text.ts, duration.ts, day.ts; plain TypeScript
modules/pose/       the native pose detector (a Nitro module)
```

- **A layer never imports one above it.** `workout/` knows nothing about the catalog, `exercises/` knows
  nothing about workouts, and `components/` knows nothing about any feature.
- **A feature's `components/` and `pose/` are its own UI.** Another feature may use its logic (challenges
  reads `workout/plan/results.ts`) but not its views; only a route composes two features' UI.
- **`exercises/` is framework-free:** no React, React Native, Expo, Skia or XState. It takes pose data
  and returns numbers, so plain tests cover it. From the pose module it may import
  only _types_ and the joint names (`superhabit-pose/joints`: plain constants, no native code).
- **`lib/` is the floor:** every layer may use it, it imports nothing of ours and no framework. One focus
  per file, named for it (`text.ts`, not `utils.ts`); its README lists what each holds.
- **Storage knows how, a feature knows what.** `storage/` holds the tables and opens the database; it
  holds no feature rules and shows nothing. A feature's model (`challenges/library.ts`) says what is kept
  and the rules for changing it, and its screens decide how to tell you a write failed.
- **Each feature has exactly one store file for its tables:** `challenges/library.ts`, `streak/store.ts`,
  `workout/store.ts` and `account/store.ts` own their features' database access. The kept account's row
  itself is read in `storage/account.ts`, because file paths below every feature need `userId()`.
- **Workout logic (`src/workout/*.ts`, `plan/`, `session/`, `capture/`, `coach/`) never imports its own UI**
  (`components/`, `pose/`). UI reads the session through `sessionView`, and the machine never learns how
  it is drawn.
- **No `../` imports.** Within a folder use `./name`; across folders use `@/…`. That keeps the layer
  bans above from being dodged with a relative path.
- **No import cycles, type-only ones included.** A cycle means a contract sits in the wrong file: move
  the shared types down into their own module (as `workout/plan/results.ts` holds the result types the session and its screens share).

## The server (`server/`)

The Cloudflare Worker is a separate package with the same idea: a folder per feature, imports only going
down. Lint enforces the import bans for files named `routes.ts` and `store.ts` and for `db/` (`serverLayer` in
`vite.config.mts`); the other files (`auth/`, `leagues/points.ts`, `traces/header.ts`, the pages) are held
to it by review.

```
server/src/index.ts        the Worker: mounts each feature's routes, runs the Cron
  ↓
<feature>/routes.ts        HTTP only: reads and checks the request, picks the status, calls stores
  ↓
<feature>/store.ts         the feature's rules and queries; no Hono
  ↓
db/                        tables (schema.ts, Better Auth's auth-schema.ts) and the connection (db.ts)
```

- A route may call another feature's store (`GET /me` reads consents); a store never imports a route.
- `auth/` holds Better Auth's setup and the `signedIn` middleware every signed-in route uses.
- Tests sit beside each feature (`consents/consents.test.ts`) and drive the whole Worker through
  `__fixtures__/worker.ts`: a real local D1 and Google tokens signed with a test key.

## Where a new file goes

Ask who uses it, not what it is:

1. Only one feature uses it → inside that feature (`src/workout/…`), even if it looks generic.
2. Two features use it, and it has no business logic → `src/components/` (UI), `src/lib/` (plain
   TypeScript with one focus: text, durations) or next to its closest shared neighbour.
3. It decides something about exercises (an angle, a threshold, a rep) → `src/exercises/`.
4. It is a route → `src/app/`, kept thin: anything with logic moves into the feature.

Move a file up into a shared layer when a second user appears, not before.

A `components/` folder means "UI pieces owned by the folder it sits in". A `.ts` helper next to the
`.tsx` that uses it is fine (`pose/skeleton.ts` beside `pose/pose-camera.tsx`): ownership matters, the
file extension does not.

## Platform first

Use what the platform already ships before drawing or building our own:

- **Icons** are Material Symbols through `components/icon.tsx` (`expo-symbols`). Only pictures no icon set
  has, the exercise figures and the surprise die, are drawn, in `components/illustrations.tsx`.
- **Buttons and controls** are Material's, from `@expo/ui` (Compose): `components/icon-button.tsx`,
  `components/text-button.tsx`, sliders, switches, dialogs, sheets. They bring the 48dp target, ripple and
  TalkBack roles. Build a custom one only for what Material has no form of (the lit primary key, hold to
  start).

## Naming

- Name a file by its content: `exercises/registry.ts`, `workout/plan/results.ts`. No `index.ts` barrels, and
  no `utils`, `helpers`, `types` or `common` files or folders: they tell a reader nothing and fill up
  with unrelated code.
- kebab-case file names; `.tsx` only when the file renders.
- Tests sit beside their source as `name.test.ts`; shared test data in `__fixtures__/`.

## State

`AGENTS.md` has the rules; in short, each kind of state has one owner:

- lifecycles (camera session, recording, speech, timers) → XState actors invoked by a machine;
- per-frame data (pose points, angles) → Reanimated shared values drawn by Skia;
- what a screen shows → derived from the machine snapshot (`sessionView`), not copied into React state;
- local UI state (a modal is open) → React state in that component.

## Reading data on screens

Every live read belongs in one shared provider mounted once in the root layout. Screens and pushed
pages read its complete snapshot synchronously: no fetching on mount or data loading states. Add a new
table or view to the provider, never a per-screen query; derive streaks and challenge pages from the
snapshot with pure functions. Keep the splash up until the first reads finish. Per-page reads caused a
measured ~40 ms push-animation stall; exposing empty snapshots also made cold-start content pop in.

## Tests

Test behaviour that can break: a branch, a threshold, a state transition, a file that must be deleted.
One test that fails when the code is wrong beats several that pass either way.

### Tautological tests considered harmful

A tautological test proves only that the code does what the code does. It passes whether or not the
behaviour is right, so it gives confidence it hasn't earned and makes refactoring look risky when nothing
is guarded. Signs of one:

- **The expected value is computed with the code under test, or with a copy of its formula.**
  `expect(angle(a, b, c)).toBe(Math.acos(...same maths...))` repeats the bug instead of catching it.
  Write the value out by hand from a case you can check on paper: a right angle is `90`.
- **The test asserts what it set up.** A mock returns `5`, and the test checks that the result is `5`.
  Nothing real ran.
- **Everything around the unit is mocked**, so the test pins the current call sequence, not the outcome.
  It breaks on every refactor and on no bug.
- **It restates the implementation:** "calls `smooth` then `round`". Assert what a user or caller sees:
  the rep counted, the file deleted, the event sent.
- **It can't fail.** Before trusting a new test, break the code it guards (flip a condition, delete the
  fix) and watch it go red. If it stays green, it is tautological.

Fake only the boundaries we don't own (native modules, the file system, the camera), keep them dumb, and
let the real logic run between them. `workout/session/session.test.ts` does this: it fakes the landmarker, speech, file
system and video output, and runs the real machine, counters and camcorder.

## Shortcuts

A deliberate limit gets a comment where it lives: `// shortcut: <the limit>, <when to upgrade>`. It is a
decision, not a bug; review the list before building on that code.
