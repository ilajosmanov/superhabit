# plan

The workout's plain data and calculations, shared by the runner, stores and challenge progress.

| File            | Holds                                                                                                 |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| `plan.ts`       | `Challenge`, `Session`, goals, validation, `readPlan` and expanded steps                              |
| `results.ts`    | `Attempt`, `StepResult`, finished sets, goal shares and `countedWorkouts` for streaks and the day log |
| `logged-set.ts` | the `LoggedSet` contract and `readSets`, mapping already-read rows into it                            |

`logged-set.ts` keeps the shared contract below the store and results, avoiding a type import cycle.
Tests beside the source cover plans and results. Calendar days live in `lib/day.ts`: every feature uses them.
