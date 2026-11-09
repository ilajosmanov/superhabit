# Workout

One session in front of the camera, and the workout it keeps.

| File                     | Holds                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------- |
| `plan.ts`                | the session tree (`Challenge`, `Session`), `readPlan(json)` (null: from a newer app), `expand`     |
| `session.ts`             | `workoutSession`: the machine for one session; its native actors live for the whole run            |
| `counting.ts`            | what one detector frame does to the current counter, what to flash and say                         |
| `framing.ts`             | the body parts out of frame, once a reading holds                                                  |
| `orientation-lock.ts`    | the screen turned the way each exercise is filmed                                                  |
| `session-view.ts`        | `sessionView(snapshot)`: what the screen shows, read from the machine                              |
| `results.ts`             | a finished set (`StepResult`) and how much of its goal it got                                      |
| `log.ts`                 | `workoutLog`: the session's writes; `logSet`, `saveWorkout`, `discardWorkout`                      |
| `recovery.ts`            | a workout left open: `findOpenWorkout`, `useLeftWorkout(own)`, the Save / Discard machine          |
| `logged-set.ts`          | `readSets(rows)`: stored sets read back for progress                                               |
| `day.ts`                 | local `YYYY-MM-DD` days: `today`, `addDays` (DST-safe), `dayLabel`, `nextMidnight`                 |
| `camcorder.ts`           | the camera's takes for each set                                                                    |
| `recorder.ts`            | each set's trace, packed frame by frame; stretches, pauses, restart or camera flip, frame rate     |
| `recorder-file.ts`       | after paint: finish the trace, native gzip into a temp file, rename; logs encode/write ms; discard |
| `speech.ts`, `phrase.ts` | the coach: what is said, and saying it                                                             |
| `components/`            | the session's screens; `session-screen.tsx` is the page the route composes                         |
| `pose/`                  | camera → pose detection → skeleton drawing                                                         |

The session takes `{ challenge, workoutId, target, start }` and invokes the log with them. Each
finished set (a fresh `setId`, also after restart and camera flip) is written into an `open` workout
as it ends, the first one opening it; Done (`save`) marks it done and queues it for the server in one
transaction, and the session's `saved` turns true once that went through. A set that failed to write
is written again before the next write. Discard, or a session stopped without Done, deletes the open
workout. The session advances only forward, so a workout has at most one set per plan step.

Only one workout is open at a time: a workout left open (the app closed before Done) is offered back
with Save (ended when its last set ended) or Discard, at launch (`bootstrap/startup.ts`) and before a
new session starts (`components/session-screen.tsx`).

Session tests run the real machine and log on Node's SQLite (`@/storage/__fixtures__/database`), faking
only the native boundaries (`__fixtures__/session.ts`).

Recording (`record: true`) keeps each finished set at
`documents/<userId()>/traces/pending/<setId>.sht`. Each frame is packed as it arrives; at set end the
packed trace is finished on the JS thread, then `superhabit-gzip-file` gzips it into `<setId>.sht.tmp`
off the JS thread before the rename. The phone logs `[recorder] encode ms` (JS) and `write ms` (native).
The Done switch controls videos only. Discard deletes the workout's traces, including pending writes;
starting a recorder sweeps temporary files left by a crash.
