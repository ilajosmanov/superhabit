# Coding standards

How Superhabit is laid out and why. `AGENTS.md` holds the tooling and React rules; this file holds the
architecture. Lint (`vite.config.mts`) enforces most of it, so `vp check` fails when the code drifts.

## Layers

Imports only go down:

```
src/app/            routes: read params, compose a screen, navigate
  ↓
src/friends/        the friends feature (for now, the leaderboard preview)
src/challenges/     the challenge catalog: definitions, catalog entries, the cards that browse them
  components/       UI only challenges uses (catalog tiles, joined cards, exercise stack)
  ↓
src/workout/        the workout feature: plan model, session machine, results, camcorder, coaching
  components/       UI only workout uses (platters, gauge, clip card)
  pose/             camera → pose detection → skeleton drawing
  ↓
src/exercises/      pure rep logic: angles, counters, the exercise registry
  ↓
src/components/     UI shared by every screen (icons, screen shell, buttons)
src/theme.ts        colour tokens for APIs that take values; classes come from src/global.css
src/storage/        what is kept on the phone and how: files, safe writes, change notices; no UI
modules/pose/       the native pose detector (a Nitro module)
```

- **A layer never imports one above it.** `workout/` knows nothing about the catalog, `exercises/` knows
  nothing about workouts, and `components/` knows nothing about any feature.
- **`exercises/` is framework-free:** no React, React Native, Expo, Skia or XState. It takes pose data
  and returns numbers, so plain tests cover it. It may import the pose module's _types_ only.
- **Storage knows how, a feature knows what.** `storage/` reads and writes and reports a failed write;
  it holds no feature rules and shows nothing. A feature's model (`challenges/mine.ts`) says what is kept
  and the rules for changing it, and its screens decide how to tell you a write failed.
- **Workout logic (`src/workout/*.ts`) never imports its own UI** (`components/`, `pose/`). UI reads the
  session through `sessionView`, and the machine never learns how it is drawn.
- **No `../` imports.** Within a folder use `./name`; across folders use `@/…`. That keeps the layer
  bans above from being dodged with a relative path.
- **No import cycles, type-only ones included.** A cycle means a contract sits in the wrong file: move
  the shared types down into their own module (as `workout/results.ts` did for `session` ↔ best rep).

## Where a new file goes

Ask who uses it, not what it is:

1. Only one feature uses it → inside that feature (`src/workout/…`), even if it looks generic.
2. Two features use it, and it has no business logic → `src/components/` (UI) or next to its closest
   shared neighbour.
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

- Name a file by its content: `exercises/registry.ts`, `workout/results.ts`. No `index.ts` barrels, and
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
let the real logic run between them. `session.test.ts` does this: it fakes the landmarker, speech, file
system and video output, and runs the real machine, counters and camcorder.

## Shortcuts

A deliberate limit gets a comment where it lives: `// shortcut: <the limit>, <when to upgrade>`. It is a
decision, not a bug; review the list before building on that code.
