# Challenges

The challenge catalog, the challenges and runs kept on the phone, progress rules and challenge UI.

| File               | Holds                                                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `suggested.ts`     | ours, with fixed ids; a changed one gets a new version id                                                                  |
| `library.ts`       | the store: seed, join, leave, create, edit with outbox rows, and challenge table queries                                   |
| `library-live.tsx` | `LibraryProvider` (in the root layout) reads the tables once; `useLibrary()` shares them                                   |
| `library-view.ts`  | what screens show from those rows: your runs, the catalog, a challenge's page, a day's log                                 |
| `run-view.ts`      | a run in words: DONE, 64%, MISSED, IN 3 DAYS                                                                               |
| `session-start.ts` | `useSessionStart`: what a workout runs, fixed as it starts, and its run for the Done page                                  |
| `progress.ts`      | day results and run calendars from plain inputs, with no database                                                          |
| `one-go.ts`        | `ONE_GO`, the exercises offered on their own, and `oneGo`: one go at one, as many as you can                               |
| `hold.ts`          | `isHold`: an exercise timed in seconds, not counted in reps                                                                |
| `plan-view.ts`     | how a challenge's plan reads on its page: parts and rows (`planView`), sets and tracking line (`trackedSets`), `restLabel` |
| `catalog.ts`       | a challenge as its card shows it                                                                                           |
| `draft.ts`         | what the builder edits                                                                                                     |
| `reel.ts`          | sets with video as one reel: the session just done (`reelOf`), or a day's (`dayReel`)                                      |
| `reel-playback.ts` | the machine that plays a reel's files back to back on two players that take turns                                          |

`components/` holds the UI only challenges uses:

| File                                                             | What it is                                                                           |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `catalog.tsx`                                                    | the catalog: ours, then yours not running, a card each, and Create a challenge       |
| `your-challenges.tsx`, `joined-card.tsx`, `unavailable-card.tsx` | the swipe row of your runs and their cards                                           |
| `surprise-card.tsx`, `surprise-button.tsx`, `surprise-sheet.tsx` | a random one go: the card, Home's die, the sheet before the camera                   |
| `challenge-preview.tsx`                                          | a challenge's page before you join: its plan and how it counts                       |
| `joined-challenge.tsx`                                           | a challenge's page while you are in: today, the day strip, the day's plan and videos |
| `session-plan.tsx`, `numeral.tsx`                                | what a day asks for and got; a one-exercise day as the giant numeral                 |
| `day-strip.tsx`                                                  | every day of a run as a bar to pick a day on                                         |
| `watch-day.tsx`                                                  | a picked day's sets as frames that play their videos                                 |
| `day-log.tsx`                                                    | Home's list of a day's saved workouts; a row with videos plays them                  |
| `rolling-lines.tsx`                                              | lines that take turns, for the day log's empty state                                 |
| `how-it-counts.tsx`                                              | a card per exercise: the figure doing a rep, and the rep in steps                    |
| `exercise-stack.tsx`                                             | a challenge's exercise figures in a row, and (i) for all its steps                   |
| `hold-to-start.tsx`, `leave-button.tsx`                          | the footer: hold to start today's session; leave the run, after asking               |
| `challenge-done.tsx`                                             | the Done page after a session: its reel, the numbers, the run                        |
| `session-reel.tsx`, `session-viewer.tsx`, `reel-player.tsx`      | the reel on a loop, full screen like stories, and the players under both             |
| `exercise-picker.tsx`, `builder.tsx`                             | making a challenge: pick the exercise, then name it and set its numbers              |
| `swipe-row.tsx`                                                  | a row of cards that snaps card by card                                               |

A run of ours is pinned to the version you joined; a run of yours follows your edits. Finished, missed
and restarted are worked out from done workouts (`progress.ts`), never stored. A day you did plays its
sets' videos (`watch-day.tsx`): the sets the day shows, their files listed once as the day is picked. Home's
day log (`day-log.tsx`) lists the day's files once the same way, and offers play only on a row whose videos
are still on the phone (kept 30 days, never synced).
The day reel lists files directly through `storage/set-files.ts`; workout's store supplies its row queries.
Once you leave or finish a challenge you made, the catalog lists it after ours, to join again. Pages and workouts are addressed by run id, so several runs of one challenge stay apart. A plan from a newer app (`readPlan`
is null) can't be joined, and a run on one shows "Update the app", never another version.

Tests that write use real SQL: `library.test.ts` mocks `@/storage/database` with the Node fixture.

`LibraryProvider` (root layout) is the app's one live reader: a query per table, each re-run only when
its own table changes. Screens render once every table has first read; its first layout tells startup
to hide the splash, and a first read that failed shows startup's error with Retry. Screens and pushed
pages read the snapshot synchronously (`useLibrary`) and derive what they show in pure functions: your
runs, a challenge's page, Home's streak and a day's workouts (`dayLog`).
