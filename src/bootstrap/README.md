# bootstrap

The app's start, above every feature and below the routes.

| File             | Holds                                                                                                                                                                                                                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `startup.ts`     | the machine the root layout runs: migrate, sign in (once), ask about sharing traces (once), seed, bring back what your account holds (until a pull has), offer back a workout left open, keep today, write freezes of days that are over, check the session; after Delete account, clear the phone |
| `keep-synced.ts` | `keepSynced`, the actor that sends and pulls while you're signed in (at the start, when the app or the network comes back, after a change is queued), retrying slower each time                                                                                                                    |
| `day.ts`         | `dayClock`, the actor that tells the day at midnight, when the app returns, and within a minute of a time zone change                                                                                                                                                                              |
| `left-open.ts`   | `useLeftOpen()`: the workout startup found open; a page linked at launch waits for its Save or Discard                                                                                                                                                                                             |
| `leave.ts`       | `useLeave()`: Profile's Sign out and Delete account, sent to the startup machine                                                                                                                                                                                                                   |
| `today.ts`       | `useToday()`: the day for screens (never `today()` while rendering)                                                                                                                                                                                                                                |

`startup.ts` only orders the steps; each lives with its owner: opening and migrating the database in
`storage/`, signing in and the session in `account/`, seeding our challenges in `challenges/`, sending and pulling in `account/sync.ts`, finding and saving or discarding a workout left
open through `workout/store.ts` and the machine in `workout/recovery.ts`. The store also owns startup
file cleanup, which waits until a pull has brought back the sets a video belongs to. After checking the database, `reading` mounts the shared `LibraryProvider` once. It gates
its children until every table has first read; its wrapper's `onLayout` then reports `dataReady` once the
screens under it are laid out. Startup can then enter `ready` (or offer recovery) and hide the splash. No event is sent
during render, and the provider stays mounted through recovery and normal navigation. A failed step
shows the error and Retry; the machine hides the native splash only once, including after recovery or retry.
