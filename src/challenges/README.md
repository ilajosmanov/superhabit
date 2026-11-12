# Challenges

The challenge catalog, the challenges and runs kept on the phone, progress rules and challenge UI.

| File               | Holds                                                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `suggested.ts`     | ours, with fixed ids; a changed one gets a new version id                                                                  |
| `library.ts`       | the store: seed, join, leave, create, edit, archive with outbox rows, and challenge table queries                          |
| `library-live.tsx` | `LibraryProvider` (in the root layout) reads the tables once; `useLibrary()` shares them                                   |
| `library-view.ts`  | what screens show from those rows: your runs, the catalog, a challenge's page, a day's log                                 |
| `run-view.ts`      | a run in words: DONE, 64%, MISSED, IN 3 DAYS                                                                               |
| `session-start.ts` | `useSessionStart`: what a workout runs, fixed as it starts, and its run for the Done page                                  |
| `progress.ts`      | day results and run calendars from plain inputs, with no database                                                          |
| `one-go.ts`        | `ONE_GO`, the exercises offered on their own, and `oneGo`: one go at one, as many as you can                               |
| `hold.ts`          | `isHold`: an exercise timed in seconds, not counted in reps                                                                |
| `plan-view.ts`     | how a challenge's plan reads on its page: parts and rows (`planView`), sets and tracking line (`trackedSets`), `restLabel` |
| `catalog.ts`       | a challenge as its card shows it                                                                                           |
| `draft.ts`         | what the builder edits; shared `Amount` and slider ranges                                                                  |
| `tune.ts`          | a suggested challenge's editable numbers, slider ranges, and tuned plan for joining                                        |
| `reel.ts`          | sets with video as one reel: the session just done (`reelOf`), or a day's (`dayReel`)                                      |
| `reel-playback.ts` | the machine that plays a reel's files back to back on two players that take turns                                          |

`components/` holds the UI only challenges uses:

`archive-button.tsx` offers Archive on your challenge's page, after confirming that it is permanent.
Archived challenges leave the catalog and active runs, but their details and workout history stay.
They cannot be edited, joined or restored; doing one again means creating a new challenge. The stored
`retiredAt` stops all its runs, including runs arriving later from an offline phone, without rewriting
their history. Archiving syncs through the outbox like other library changes.

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
| `exercise-row.tsx`                                               | the outlined row of the catalog and the day log: name, exercises under it, a number  |
| `hold-to-start.tsx`, `leave-button.tsx`                          | the footer: hold to start today's session; leave the run, after asking               |
| `challenge-done.tsx`                                             | the Done page after a session: its reel, the numbers, the run                        |
| `session-reel.tsx`, `session-viewer.tsx`, `reel-player.tsx`      | the reel on a loop, full screen like stories, and the players under both             |
| `exercise-picker.tsx`, `builder.tsx`                             | making a challenge: pick the exercise, then name it and set its numbers              |
| `amount-input.tsx`                                               | the shared editable numeral, dashed underline and M3 slider; optional Max stop       |
| `tune-numbers.tsx`                                               | Your numbers: a suggested challenge's numbers, changed before you join               |
| `swipe-row.tsx`                                                  | a row of cards that snaps card by card                                               |

Suggested workouts are authored in `suggested.ts` using `workout/plan/structures.ts`. Keep ids and
version ids stable; changing a shipped prescription needs a new version, retaining the old one for
pinned runs. The four existing testing prescriptions are unchanged. New suggestions include sets,
circuits, crossover/descending/up-and-down ladders and daily single-exercise totals. All use Your
numbers before joining. Standalone workouts default to one day (repeat by joining again); the daily
favourites have longer runs. A one-day workout does not imply a weekly schedule.

Catalog adaptations: the four-move “1000” totals 800 and is named accordingly; the shortened circuit
has no seven-minute guarantee. Side plank is omitted pending tuning. Burpee routines use the existing
counter, whose timing still needs device validation. Lunges count individual reps on either leg:
Lunges and squats uses 40 total, without enforcing 20 per side. The 100/100/100 session uses push-ups,
squats and sit-ups; only single-exercise daily totals accumulate across separate workouts.

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
