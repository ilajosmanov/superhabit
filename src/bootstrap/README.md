# bootstrap

The app's start, above every feature and below the routes.

| File         | Holds                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------- |
| `startup.ts` | the machine the root layout runs: migrate, seed, offer back a workout left open, keep today |
| `day.ts`     | `dayClock`, the actor that tells the day at midnight and when the app returns               |
| `today.ts`   | `useToday()`: the day for screens (never `today()` while rendering)                         |

`startup.ts` only orders the steps; each lives with its owner: opening and migrating the database in
`storage/`, seeding our challenges in `challenges/`, finding and saving or discarding a workout left
open through `workout/store.ts` and the machine in `workout/recovery.ts`. The store also owns startup
file cleanup. The splash stays up until there is something to show; a failed step
shows the error and Retry.
