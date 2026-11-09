# Workout

`plan.ts` owns session trees, validation, expansion and goal completion. `readPlan(unknown)` validates
stored JSON with Zod and returns null for unsupported exercises/shapes or invalid plans. It accepts at
most 1000 rounds per block. Daily total requires one expanded exercise set with a finite target.
`results.ts` calculates set/session shares from reps and hold time; live and persisted results share it.

`day.ts` owns local `YYYY-MM-DD` dates, labels and DST-safe calendar arithmetic. `today` uses the local
calendar; `addDays` uses UTC calendar-day numbers, never elapsed local hours.

The session machine owns the live workout and invokes native resource actors; `counting.ts` steps the
current counter on each detector frame and says what changes, what to flash and what the coach says.
UI reads the derived session view. Pure tests sit beside their sources and import `vite-plus/test`.

Each session allocates a `workoutId`, and every fresh set gets a `setId` (including restart and camera
flip). Pause/resume keeps both IDs. Finishing a set stores a `StepResult` and sends it to the `log`
actor: its `id`, `workoutId`, expanded `planStep` (rests included in the index), exercise, goal,
amounts, wall-clock boundaries, counter version and every timed attempt. `results.ts` captures this
snapshot; attempt timestamps use the detector clock, separate from set wall time. Holds have no
attempts.

`log.ts` keeps the workout in the database. The route provides `workoutLog(target)` as the session's
`log` (tests provide a fake): the first set opens the workout (local day, time zone and app version at
the start) with that set, each later set is added as it finishes, Done (`save`) marks it done and queues
it for the server in one transaction, and Discard, or a session stopped without Done, discards it. A
failed write keeps the set and writes it again before the next write; Done saves only once every set is in and
answers `logSaved` (the session's `saved`) or `logFailed` (`unsaved`, and Done can be tapped again).
Only one workout is open at a time: `recovery.ts` offers a workout left open (the app closed before
Done) back with Save (ended when its last set ended) or Discard, at launch (`bootstrap/startup.ts`) and
before a new workout starts (`useLeftWorkout` in `open-workout.ts`); `components/recover-prompt.tsx` is
the prompt. `logged-set.ts` reads stored sets back for progress, and
`results.ts` lines them up with the plan's steps.

The session advances only forward: a finished step cannot be redone in the same workout. Restart
replaces only the unfinished set, so there is at most one finished result per `(workoutId, planStep)`.
