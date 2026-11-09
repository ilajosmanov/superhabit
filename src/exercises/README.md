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

Labels are the name, the phone spot and its setup copy, and the hint. The kind works out the rest
from its position and measure: the start heading, the body parts to frame, the gauge and the stats
line.

| Folder       | Holds                                                         |
| ------------ | ------------------------------------------------------------- |
| `kinds/`     | how counting works: cycle, hold, sequence                     |
| `positions/` | which body position you are in, and whether your form is good |
| `measures/`  | what moves: a joint angle, an elevation, the feet's spread    |
| `body/`      | reading the pose dots: geometry, smoothing, recorded traces   |

This top level holds only the exercises themselves (`plank.ts`, `pushup.ts`, …), `exercise.ts`
(labels, and `exercise()` to join them to a kind) and `registry.ts` (the list of exercises). Other folders import
from `registry.ts`.

Every exercise is a short config on these primitives; the plan is in the "Superhabit primitives"
doc.

Tests replay recorded clips from `__fixtures__/traces/`, which is git-ignored: see `AGENTS.md`.

`COUNTER_VERSIONS` in `registry.ts` is a hand-bumped semver for every exercise. Bump it when counting
rules change. Cycle and sequence reports expose `startMs`, `bottomMs` and `endMs` on the detector clock,
for counted and failed attempts. Cycles reuse their start/extreme tracking; `downMs` and `upMs` remain
durations. A sequence starts at its last idle start-position frame, spans all intermediate positions,
and has no bottom or depth. Reset/tracking expiry drops the unfinished attempt. Holds report breaks,
with null timing fields, and produce no attempts.
