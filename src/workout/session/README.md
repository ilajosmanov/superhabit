# session

Running one workout. UI reads the machine through `sessionView`; per-frame values go to shared values.

| File                  | Holds                                                                        |
| --------------------- | ---------------------------------------------------------------------------- |
| `session.ts`          | `workoutSession`: stages, counters and the native actors invoked for the run |
| `session-view.ts`     | the pure snapshot selector for screens                                       |
| `counting.ts`         | one detector frame's counter changes, attempts, flashes and cues             |
| `framing.ts`          | stable out-of-frame body parts                                               |
| `orientation-lock.ts` | the machine's orientation actor, restored on stop                            |
| `app-away.ts`         | tells the session when the app leaves the screen and comes back              |

Orientation belongs here because the session machine invokes it. Each finished set gets a fresh id,
also after restart or camera flip. The session advances only forward, so each plan step has at most one
stored set. The log retries failed set writes before the next write and saves only when all are in.

`session*.test.ts` run the real machine and log with Node SQLite and native boundary fakes from
`workout/__fixtures__/session.ts`; `framing.test.ts` covers the debounce on detector time.

Leaving the app pauses a set or countdown, and a rest that ends meanwhile pauses before the next set; you
resume. When the camera stops (an error after video was already dropped) the set pauses and Resume mounts
the camera afresh; when the detector can't start on the phone, only End is left, keeping the sets so far.
A set in progress is lost if Android kills the app: only finished sets are recovered.
