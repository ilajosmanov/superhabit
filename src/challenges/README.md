# Challenges

The challenge catalog, the challenges and runs kept on the phone, progress rules and challenge UI.

| File               | Holds                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------ |
| `suggested.ts`     | ours, with fixed ids; a changed one gets a new version id                                  |
| `library.ts`       | the store: seed, join, leave, create, edit with outbox rows, and challenge table queries   |
| `library-live.tsx` | `LibraryProvider` (in the root layout) reads the tables once; `useLibrary()` shares them   |
| `library-view.ts`  | what screens show from those rows: your runs, the catalog, a challenge's page, a day's log |
| `run-view.ts`      | a run in words: DONE, 64%, MISSED, IN 3 DAYS                                               |
| `session-start.ts` | `useSessionStart`: what a workout runs, fixed as it starts, and its run for the Done page  |
| `progress.ts`      | day results and run calendars from plain inputs, with no database                          |
| `challenges.ts`    | one-go exercises, and how a challenge's plan reads                                         |
| `catalog.ts`       | a challenge as its card shows it                                                           |
| `draft.ts`         | what the builder edits                                                                     |
| `reel.ts`          | sets with video as one reel: the session just done (`reelOf`), or a day's (`dayReel`)      |

A run of ours is pinned to the version you joined; a run of yours follows your edits. Finished, missed
and restarted are worked out from done workouts (`progress.ts`), never stored. A day you did plays its
sets' videos (`watch-day.tsx`): the sets the day shows, their files listed once as the day is picked.
The day reel lists files directly through `storage/set-files.ts`; workout's store supplies its row queries.
Pages and workouts are addressed by run id, so several runs of one challenge stay apart. A plan from a newer app (`readPlan`
is null) can't be joined, and a run on one shows "Update the app", never another version.

Tests that write use real SQL: `library.test.ts` mocks `@/storage/database` with the Node fixture.

`LibraryProvider` (root layout) is the app's one live reader: a query per table, each re-run only when
its own table changes. Screens render once every table has first read; its first layout tells startup
to hide the splash, and a first read that failed shows startup's error with Retry. Screens and pushed
pages read the snapshot synchronously (`useLibrary`) and derive what they show in pure functions: your
runs, a challenge's page, Home's streak and a day's workouts (`dayLog`).
