# session

Running one workout. UI reads the machine through `sessionView`; per-frame values go to shared values.

| File                  | Holds                                                                        |
| --------------------- | ---------------------------------------------------------------------------- |
| `session.ts`          | `workoutSession`: stages, counters and the native actors invoked for the run |
| `session-view.ts`     | the pure snapshot selector for screens                                       |
| `counting.ts`         | frame counting, attempts, cues and plan readouts cached once per session     |
| `framing.ts`          | stable out-of-frame body parts                                               |
| `orientation-lock.ts` | the machine's orientation actor, restored on stop                            |
| `keep-awake.ts`       | the session wake lock, released on the Done page or teardown                 |
| `app-away.ts`         | tells the session when the app leaves the screen and comes back              |

Orientation belongs here because the session machine invokes it. Each finished set gets a fresh id,
also after restart or camera flip. The session advances only forward, so each plan step has at most one
stored set. The log retries failed set writes before the next write and saves only when all are in.
Late video starts join their set by id, including on Done; a replaced set's start is ignored.

`session*.test.ts` run the real machine and log with Node SQLite and native boundary fakes from
`workout/__fixtures__/session.ts`; `framing.test.ts` covers the debounce on detector time.

Leaving the app pauses a set or countdown, and a rest that ends meanwhile pauses before the next set; you
resume. When the camera stops (an error after video was already dropped) the set pauses and Resume mounts
the camera afresh; when the detector can't start on the phone, only End is left, keeping the sets so far.
A set in progress is lost if Android kills the app: only finished sets are recovered.

With the app in front, ten idle minutes in a pause, phone switch, open-ended rest or waiting for the
start position takes the same End path as the button, keeping sets so far. Counting activity starts a
fresh wait when it is lost.
Leaving the app cancels the idle wait; returning starts a fresh ten minutes without ending the pause.
The machine releases keep-awake on the Done page; the camera stops there while its files finish.

Frames draw the skeleton as the user chose while counting, flipping, paused, counting down or switching
the phone. Pauses and countdowns record frames without stepping the counter; rests hide the dots and
skip their coordinate conversion. Done hides the dots and deactivates the camera.

Finished has separate file-finalization and save/discard states. Reviewing or a failed write accepts
Done or Discard; saving and discarding wait for the log reply, and kept/discarded ignore further taps.
`sessionView` exposes `left`, `failed` and `final`; the successful transition calls the pending leave
callback once. A failed write shows the save failure and lets the user try again.
