# Challenges

The challenge catalog, the challenges and runs kept on the phone, progress rules and challenge UI.

| File              | Holds                                                                         |
| ----------------- | ----------------------------------------------------------------------------- |
| `suggested.ts`    | ours, with fixed ids; a changed one gets a new version id                     |
| `library.ts`      | the writes: seed, join, leave, create, edit; each with its outbox row         |
| `library-live.ts` | `useLibrary()`: the tables, re-read when they change                          |
| `library-view.ts` | what screens show from those rows: your runs, the catalog, a challenge's page |
| `run-view.ts`     | a run in words: DONE, 64%, MISSED, IN 3 DAYS                                  |
| `progress.ts`     | day results and run calendars from plain inputs, with no database             |
| `challenges.ts`   | one-go exercises, and how a challenge's plan reads                            |
| `catalog.ts`      | a challenge as its card shows it                                              |
| `draft.ts`        | what the builder edits                                                        |

A run of ours is pinned to the version you joined; a run of yours follows your edits. Finished, missed
and restarted are worked out from done workouts (`progress.ts`), never stored. Pages and workouts are
addressed by run id, so several runs of one challenge stay apart. A plan from a newer app (`readPlan`
is null) can't be joined, and a run on one shows "Update the app", never another version.

Tests that write use real SQL: `library.test.ts` mocks `@/storage/database` with the Node fixture.
