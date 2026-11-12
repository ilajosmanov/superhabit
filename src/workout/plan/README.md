# plan

The workout's plain data and calculations, shared by the runner, stores and challenge progress.

| File            | Holds                                                                                                 |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| `plan.ts`       | `Challenge`, `Session`, goals, validation, `readPlan` and expanded steps                              |
| `structures.ts` | code authoring: exercise sets, repeated sets, circuits, explicit ladders and composed sessions        |
| `results.ts`    | `Attempt`, `StepResult`, finished sets, goal shares and `countedWorkouts` for streaks and the day log |
| `logged-set.ts` | the `LoggedSet` contract and `readSets`, mapping already-read rows into it                            |

`logged-set.ts` keeps the shared contract below the store and results, avoiding a type import cycle.
Tests beside the source cover plans and results. Calendar days live in `lib/day.ts`: every feature uses them.

## Authoring workouts

`structures.ts` builds the same serializable `Session` the runner, storage, preview and tuning screen
already use. A future builder can use these constructors too. No constructor stores callbacks or adds
a second execution model.

```ts
import { circuit, exerciseSet, ladder, session, sets } from '@/workout/plan/structures';

const burpeeRound = circuit({
  exercises: [exerciseSet('burpee', 5), exerciseSet('situp', 10), exerciseSet('squat', 15)],
  rounds: 8,
  restBetweenRounds: 30,
});

const crossover = ladder({
  rungs: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
  exercises: (n) => [exerciseSet('pushup', n), exerciseSet('squat', 11 - n)],
  restBetweenRungs: 20,
});

const floorThenStanding = session(
  sets({ exercise: exerciseSet('pushup', 10), rounds: 3, restBetweenSets: 30 }),
  sets({ exercise: exerciseSet('squat', 15), rounds: 3, restBetweenSets: 30 }),
);
```

- `exerciseSet` uses reps for counted exercises and seconds for holds. `'max'` is open-ended.
- `sets` and `circuit` default to one round. Rests default to zero; `restBetweenExercises` and
  `restBetweenRounds` are independent. Zero omits a rest, negative/fractional rests are rejected.
- `ladder` takes the exact ordered rungs: `[21, 15, 9]`, or `[1, 2, 3, 2, 1]` with the peak once.
  Its callback returns each rung's exercise targets; each rung is one block and one round.
- `session` joins parts in order. Repeated parts retain their closing rest at a join; single-round
  parts and ladders have no closing rest. Execution always drops the final rest of the entire workout.
- Each constructor returning a session validates it against the stored plan contract. Pass it to
  `defineChallenge` with the name, days and challenge settings for challenge-level validation.

These are session structures. Increasing targets across days, weekly schedules, and per-leg targets
need their own contracts; a rung is not a calendar day. The existing tuning flow changes the generated
targets and rounds independently; it does not preserve a ladder formula when a single target changes.
