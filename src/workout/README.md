# Workout

One session in front of the camera, and the workout it keeps. Logic imports no workout UI.

| File or folder  | Holds                                                                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `store.ts`      | the only database access for workouts and sets: writes, row readers, recovery queries and file cleanup rules (recordings kept 30 days, pending uploads kept) |
| `log.ts`        | `workoutLog`: the session's write actor, retries, Done and Discard                                                                                           |
| `recovery.ts`   | the Save / Discard machine for a workout left open                                                                                                           |
| `plan/`         | the plan model, finished and stored set contracts, results and local days                                                                                    |
| `session/`      | the machine, cached plan readouts, frame counting, framing, orientation and wake locks                                                                       |
| `capture/`      | trace recording, filming and in-flight native writes                                                                                                         |
| `coach/`        | what the coach says, and saying it                                                                                                                           |
| `components/`   | workout UI; `session-screen.tsx` is the page a route composes                                                                                                |
| `pose/`         | camera → pose detection → skeleton drawing                                                                                                                   |
| `__fixtures__/` | native boundary fakes and poses for session tests                                                                                                            |

Finished sets open a workout; Done keeps it and queues it for the server in one transaction. Discard
deletes its rows before its trace and video files, including late writes. A workout left open is offered
back at startup and before another session starts. The store owns these rules; `storage/set-files.ts`
owns the phone's per-set file layout.

The shared `setRows` read leaves out attempts, metrics and counter versions; Done queues full rows for
sync. `setIsSynced` permits trace sharing only after Done and removal of every outbox row for that workout,
including parked changes.

Tests sit beside their source and run the real session, log and Node SQLite, faking native boundaries.
