# exercises

Pure rep logic: pose dots in, reps, failed reps and held time out. No React, Expo or XState here,
so plain tests cover all of it.

An exercise is built from primitives, each in its own folder:

```
plank   =  hold (kind)            +  plank (position)                    +  labels
push-up =  position-cycle (kind)  +  plank (position) + elbow (measure)  +  labels
```

Labels are the name, phone setup copy and stats line.

| Folder       | Holds                                                         |
| ------------ | ------------------------------------------------------------- |
| `kinds/`     | how counting works: cycle, sided, hold, sequence              |
| `positions/` | which body position you are in, and whether your form is good |
| `measures/`  | what moves: a joint angle; later a height and a spread        |
| `body/`      | reading the pose dots: geometry, smoothing, recorded traces   |

This top level holds only the exercises themselves (`plank.ts`, `pushup.ts`, …), `exercise.ts`
(what an exercise must provide) and `registry.ts` (the list of exercises). Other folders import
from `registry.ts`.

The exercise files are being rebuilt one at a time as short configs on these primitives. Those
not rebuilt yet still write their own geometry. The plan is in the "Superhabit primitives" doc.

Tests replay recorded clips from `__fixtures__/traces/`, which is git-ignored: see `AGENTS.md`.
