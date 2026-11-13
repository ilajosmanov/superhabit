# exercises

Pure rep logic: pose dots in, reps, failed reps and held time out. No React, Expo or XState here,
so plain tests cover all of it.

An exercise is built from primitives, each in its own folder:

```ts
plank   = exercise(hold(plankPosition), labels)
push-up = exercise(cycle(plankPosition, jointAngle('elbow'), thresholds), labels)
squat   = exercise(cycle(standingPosition, bothSides(jointAngle('knee'), 35), thresholds), labels)
burpee  = exercise(sequence([standingPosition, plankPosition], { maxStepMs }), labels)
```

Labels are the name, the phone spot and its setup copy, the hint and the `how` steps for doing a rep.
The kind works out the rest from its position and measure: the start heading, the body parts to frame, the gauge and the stats
line.

| Folder       | Holds                                                         |
| ------------ | ------------------------------------------------------------- |
| `kinds/`     | how counting works: cycle, hold, sequence                     |
| `positions/` | which body position you are in, and whether your form is good |
| `measures/`  | what moves: a joint angle, an elevation, the feet's spread    |
| `body/`      | reading the pose dots: geometry, smoothing                    |

This top level holds only the exercises themselves (`plank.ts`, `pushup.ts`, …), `exercise.ts`
(labels, and `exercise()` to join them to a kind) and `registry.ts` (the list of exercises). Workout
code reads the exercise list and shared contracts from `registry.ts`; its session, orientation,
depth gauge and pose code also import focused helpers and types from `exercise.ts`, `body/` and `kinds/`.

Every exercise is a short config on these primitives; the plan is in the "RepRepGo primitives"
doc.

Tests replay recorded clips (`.sht`, the trace file in `storage/`) from `__fixtures__/traces/`, which
is git-ignored: ask the repository owner for that folder and copy it here (see the root README's
"Recorded traces for the counter tests"). Missing recorded data prints a reminder before clip tests
skip. `__fixtures__/replay.ts` reads them (`toPose` turns a frame into dots); it is the one place here
allowed to import `@/storage/trace-file`. Clip tests keep the hand-checked counts and spans; the files
keep what the phone counted.

`COUNTER_VERSIONS` in `registry.ts` is a hand-bumped semver for every exercise. Bump it when counting
rules change. Cycle and sequence reports expose `startMs`, `bottomMs` and `endMs` on the detector clock,
for counted and failed attempts. Cycles reuse their start/extreme tracking; `downMs` and `upMs` remain
durations. A sequence starts at its last idle start-position frame, spans all intermediate positions,
and has no bottom or depth. Reset/tracking expiry drops the unfinished attempt. Holds report breaks,
with null timing fields, and produce no attempts.
