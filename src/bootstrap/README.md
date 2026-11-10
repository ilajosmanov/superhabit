# bootstrap

The app's start, above every feature and below the routes.

| File           | Holds                                                                                                                            |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `startup.ts`   | the machine the root layout runs: migrate, seed, offer back a workout left open, keep today, write freezes of days that are over |
| `day.ts`       | `dayClock`, the actor that tells the day at midnight and when the app returns                                                    |
| `left-open.ts` | `useLeftOpen()`: the workout startup found open, which its prompt offers back; pages skip it                                     |
| `today.ts`     | `useToday()`: the day for screens (never `today()` while rendering)                                                              |

`startup.ts` only orders the steps; each lives with its owner: opening and migrating the database in
`storage/`, seeding our challenges in `challenges/`, finding and saving or discarding a workout left
open through `workout/store.ts` and the machine in `workout/recovery.ts`. The store also owns startup
file cleanup. After checking the database, `reading` mounts the shared `LibraryProvider` once. It gates
its children until every table has first read, then a machine's invoked actor reports `dataReady` after
React commits. Startup can then enter `ready` (or offer recovery) and hide the splash. No event is sent
during render, and the provider stays mounted through recovery and normal navigation. A failed step
shows the error and Retry; the machine hides the native splash only once, including after recovery or retry.
