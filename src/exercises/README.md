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
| `kinds/`     | how counting works: cycle, sided, hold, sequence              |
| `positions/` | which body position you are in, and whether your form is good |
| `measures/`  | what moves: a joint angle, an elevation; later a spread       |
| `body/`      | reading the pose dots: geometry, smoothing, recorded traces   |

This top level holds only the exercises themselves (`plank.ts`, `pushup.ts`, …), `exercise.ts`
(labels, and `exercise()` to join them to a kind) and `registry.ts` (the list of exercises). Other folders import
from `registry.ts`.

The exercise files are being rebuilt one at a time as short configs on these primitives. Those
not rebuilt yet still write their own geometry. The plan is in the "Superhabit primitives" doc.

Tests replay recorded clips from `__fixtures__/traces/`, which is git-ignored: see `AGENTS.md`.
