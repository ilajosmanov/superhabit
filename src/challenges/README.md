# Challenges

The challenge catalog, the challenges and runs kept on the phone, progress rules and challenge UI.

| File                   | Holds                                                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `suggested-history.ts` | immutable older prescriptions for pinned runs                                                                              |
| `suggested.ts`         | current prescriptions, training groups and guidance; a changed one gets a new version id                                   |
| `library.ts`           | the store: seed, join, leave, create, edit, archive with outbox rows, and challenge table queries                          |
| `library-live.tsx`     | `LibraryProvider` (in the root layout) reads the tables once; `useLibrary()` shares them                                   |
| `library-view.ts`      | what screens show from those rows: your runs, the catalog, a challenge's page, a day's log                                 |
| `run-view.ts`          | a run in words: DONE, 64%, MISSED, IN 3 DAYS                                                                               |
| `session-start.ts`     | `useSessionStart`: what a workout runs, fixed as it starts, and its run for the Done page                                  |
| `progress.ts`          | day results and run calendars from plain inputs, with no database                                                          |
| `rest-days.ts`         | historical dates when all active runs prescribe rest; shared with the leaderboard server                                   |
| `one-go.ts`            | `ONE_GO`, the exercises offered on their own, and `oneGo`: one go at one, as many as you can                               |
| `hold.ts`              | `isHold`: an exercise timed in seconds, not counted in reps                                                                |
| `plan-view.ts`         | how a challenge's plan reads on its page: parts and rows (`planView`), sets and tracking line (`trackedSets`), `restLabel` |
| `catalog.ts`           | a challenge as its card shows it                                                                                           |
| `draft.ts`             | what the builder edits; shared `Amount` and slider ranges                                                                  |
| `tune.ts`              | a suggested challenge's editable numbers, slider ranges, and tuned plan for joining                                        |
| `reel.ts`              | sets with video as one reel: the session just done (`reelOf`), or a day's (`dayReel`)                                      |
| `reel-playback.ts`     | the machine that plays a reel's files back to back on two players that take turns                                          |

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

Suggested workouts are authored in `suggested.ts` using `workout/plan/structures.ts` and `schedule.ts`.
Changing a prescription needs a new version; `SUGGESTED_HISTORY` keeps replaced versions seeded for
pinned runs restored onto another phone. `suggested-history.ts` keeps earlier payloads unchanged,
including testing workloads. The original four now have release workloads. Your numbers edits
exercise targets, rounds, existing timed recovery intervals and calendar length before joining.
It does not add new rests or change exercise order. Catalog groups separate Training, Advanced
challenges and Daily goals. Preview guidance is matched by version, so a pinned old plan never
receives instructions for a newer prescription.

Regular circuits and ladders now span 14, 21 or 28 days, with two or three nonconsecutive workouts per
week. These lengths are adjustable product defaults. Frequency is informed by
[NSCA's training-frequency guidance](https://www.nsca.com/education/articles/kinetic-select/determination-of-resistance-training-frequency/),
not a claim that coaches prescribe these exact adapted routines for these durations. The 800-rep,
500-rep (Push-up squat twenty), and 100/100/100 benchmarks stay one session; their cards lead with
workload rather than `1 DAY`. The explicitly daily favourites keep their original durations.

Scheduled rest has a separate status and marker in the preview, tuning screen, joined cards and day
strip. It advances the run without workout credit or a restart. No challenge workout starts on rest;
optional standalone activity still counts toward the personal streak. Scheduled runs, including ones
you customize, pin their version at join. Edits affect new joins, never that run's past calendar.
Adding a schedule to an existing daily challenge requires creating a new challenge, because its older
unpinned runs follow edits. The current simple builder hides Edit for scheduled plans.

`rest-days.ts` keeps ended and archived runs in the historical calculation through their closing day.
Rest protects the personal streak only when at least one run is active and every active run prescribes
rest. Unknown versions block automatic rest protection. Daily plans that follow edits use versions
published by the date being evaluated, so shortening one later cannot excuse earlier misses.

Catalog adaptations: the four-move “1000” totals 800 and is named accordingly; the shortened circuit
has no seven-minute guarantee. Side plank is omitted pending tuning. Burpee routines use the existing
counter, whose timing still needs device validation. Lunges count individual reps on either leg:
Lunges and squats uses 40 total, without enforcing 20 per side. The 100/100/100 session uses push-ups,
squats and sit-ups; only single-exercise daily totals accumulate across separate workouts.

## Prescription review (2026-11-12)

Exercise order follows the training task, even when it needs more phone turns. Circuit rounds and
ladder pairs stay interleaved. General guidance supports putting priority work early and scaling
volume/recovery to the person; it does not establish one optimal sequence for these particular
bodyweight adaptations. See [ACSM's resistance-training overview](https://pmc.ncbi.nlm.nih.gov/articles/PMC12965823/)
and [ACE's bodyweight programming guidance](https://www.acefitness.org/continuing-education/certified/september-2026/9193/body-weight-training-by-design-programming-for-every-fitness-goal/).
The chosen rep counts, rests, calendars and categories below are product decisions, not individually
validated coaching prescriptions. Daily goals are participation targets, not progressive strength plans.

| Suggestion                      | Prescription and provenance                                                                                                                                                                                                                                                            |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Floor circuit                   | Original circuit: 10 push-ups, 15 sit-ups, 15 bridges, 30S plank ×3; 60S between rounds.                                                                                                                                                                                               |
| Standing circuit                | Original circuit: 15 squats, 20 jacks ×3; 30S between rounds. Three rounds is the release entry point.                                                                                                                                                                                 |
| Floor ladder                    | Original pyramid: 3/6/9/6/3 push-ups paired with 4/8/12/8/4 sit-ups; 30S between pairs.                                                                                                                                                                                                |
| Push-up squat rounds            | Replaces the misleading “5-10-15”: 10 push-ups then 15 squats ×5, 30S between rounds. Alternates work rather than finishing every push-up set first. This is not [Cindy](https://www.crossfit.com/cindy), which also includes pull-ups and a clock.                                    |
| Fifty all round                 | Preserves the five-move [Daily 50](https://gethealthyu.com/daily-50-workout/) sequence, with our own name. Fifty lunges means total, aiming for 25 each leg. Large targets may be broken into smaller efforts.                                                                         |
| Short bodyweight circuit        | Seven stations in their relative [HICT sequence](https://www.skitigers.com/uploads/2/8/8/2/28828019/hict_strength.pdf). Reps replace timed moving stations; sit-ups replace crunches. Step-ups, dips, high knees, rotation push-ups and side plank are omitted. No seven-minute claim. |
| 800 reps                        | Original advanced four-move challenge: ten rounds of 20 each, not 1000. No verified source for this exact prescription.                                                                                                                                                                |
| Push-up squat crossover         | Descending push-ups paired with ascending squats: 55 each. Keep each pair together; 20S recovery is our default. [Ladder formats](https://www.tomrowlandpodcast.com/episodes/physical-friday-ladder-workout-format) support the structure, not a claim of an optimal exact rep scheme. |
| Down the ladder                 | Burpees, squats, push-ups from 10 to 1. Our sequencing adaptation separates burpees from push-ups within each rung; it still repeats all three each rung. Related [trainer ladder](https://katiewoosley.com/2024/01/06/burpee-ladder-workout/); 20S recovery is our default.           |
| Squat burpee ladder             | Squats then burpees, 10→1: 55 each. Matches the descending shape in this [trainer workout](https://www.peanutbutterrunner.com/weekly-workouts-squat-burpee-ladder-workout/); recovery is adjustable.                                                                                   |
| Squat burpee pyramid            | Separate advanced option retaining 1→10→1, peak once: 100 each. An explicit longer variant, not the descending workout.                                                                                                                                                                |
| 21-15-9                         | Preserve squat/push-up pairs. A rep-scheme adaptation, not the exercises or timed benchmark of [Diane](https://www.crossfit.com/the-diane-workout).                                                                                                                                    |
| Burpee 5-10-15                  | Five burpees, ten sit-ups, fifteen squats. The [Whole Life Challenge source](https://cdn2.hubspot.net/hubfs/2415343/01_Landing%20Pages/E-Book%20PDFs/WLC_Bodyweight-Exercise_E-Book.pdf) is a 12-minute AMRAP; eight fixed rounds and 30S rest are our adaptation.                     |
| Push-up squat twenty            | Twenty rounds of 10 push-ups and 15 squats. Resembles a partitioned [Murph](https://www.crossfit.com/murph-workout) with runs and pull-ups removed; not named Murph. Advanced 500-rep benchmark.                                                                                       |
| Core and glutes                 | Uses the first four movements of an [11-exercise workout](https://runningonrealfood.com/core-glutes-bodyweight-workout/), not the full source minus one movement. Keep their order; two rounds and 60S rest are our adaptation. Source bridges include a brief squeeze at the top.     |
| Ab circuit                      | Original three-round pattern: 15 sit-ups, 15 leg raises, 30S plank; 30S recovery. No claim of one named routine or optimal order.                                                                                                                                                      |
| Push-up and core endurance      | Renamed from PT test drill. 20 push-ups, 40 sit-ups, 60S plank ×5; 60S recovery. Not an [official Army fitness test](https://www.jagcnet.army.mil/GoArmyJAG/Army-Fitness-Test).                                                                                                        |
| Lunges and squats               | Original three-round leg circuit; 40 total lunges, 20 squats, 30S recovery. Substantially different from the circulated Baywatch workout. The counter does not enforce side balance.                                                                                                   |
| 100 push-ups / 100 squats a day | Optional daily totals for 30 days, adjustable and divisible across workouts. Not equivalent to the progressive, three-days-a-week [Hundred Pushups program](https://hundredpushups.com/).                                                                                              |
| 22 push-ups for 22 days         | Participation goal associated with the [22-push-up campaign](https://www.hcc.edu/about/news-events-and-media/news-stories/pushups-mark-veterans-day), not a strength progression recommendation.                                                                                       |
| 100/100/100                     | Advanced completion session, retaining push-up → squat → sit-up blocks. Large blocks are an established benchmark form (compare [Angie](https://library.crossfit.com/free/pdf/71_08_Human_Power_Output.pdf)), not evidence that this exact three-move workout is optimal.              |

Volume across multiple joined challenges is not coordinated. Scaling here changes targets, rounds and
existing rests; it does not introduce unvalidated exercise variants or a personalized progression.

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
