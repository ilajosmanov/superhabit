# plan

The workout's plain data and calculations, shared by the runner, stores and challenge progress.

| File            | Holds                                                                      |
| --------------- | -------------------------------------------------------------------------- |
| `plan.ts`       | `Challenge`, `Session`, goals, validation, `readPlan` and expanded steps   |
| `results.ts`    | `Attempt`, `StepResult`, finished sets and their share of the goal         |
| `logged-set.ts` | the `LoggedSet` contract and `readSets`, mapping already-read rows into it |
| `day.ts`        | local `YYYY-MM-DD` days, labels, DST-safe addition and next midnight       |

`logged-set.ts` keeps the shared contract below the store and results, avoiding a type import cycle.
Tests beside the source cover plans, results and day arithmetic.
