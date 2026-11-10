# Workout

One session in front of the camera, and the workout it keeps. Logic imports no workout UI.

| File or folder  | Holds                                                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `store.ts`      | the only database access for workouts and sets: writes, row readers, the days you trained, recovery queries and file cleanup rules |
| `log.ts`        | `workoutLog`: the session's write actor, retries, Done and Discard                                                                 |
| `recovery.ts`   | the Save / Discard machine for a workout left open                                                                                 |
| `plan/`         | the plan model, finished and stored set contracts, results and local days                                                          |
| `session/`      | the machine, view selector, frame counting, framing and orientation lock                                                           |
| `capture/`      | trace recording, filming and in-flight native writes                                                                               |
| `coach/`        | what the coach says, and saying it                                                                                                 |
| `components/`   | workout UI; `session-screen.tsx` is the page a route composes                                                                      |
| `pose/`         | camera → pose detection → skeleton drawing                                                                                         |
| `__fixtures__/` | native boundary fakes and poses for session tests                                                                                  |

Finished sets open a workout; Done keeps it and queues it for the server in one transaction. Discard
deletes its rows before its trace and video files, including late writes. A workout left open is offered
back at startup and before another session starts. The store owns these rules; `storage/set-files.ts`
owns the phone's per-set file layout.

Tests sit beside their source and run the real session, log and Node SQLite, faking native boundaries.
