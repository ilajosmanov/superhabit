# kinds

How counting works, independent of any exercise. A kind takes one sample per frame and returns the
next state. It is pure: the same state and sample always give the same result.

| Kind          | Counts                                                                            | Example           |
| ------------- | --------------------------------------------------------------------------------- | ----------------- |
| `cycle.ts`    | a measure going down and back up in a position: setup at the top, form throughout | push-up, squat    |
| `hold.ts`     | time spent in a position; poor form pauses, leaving it breaks                     | plank             |
| `sided.ts`    | a cycle on each side, counted together                                            | lunge             |
| `sequence.ts` | named poses in order, such as standing → plank → standing                         | burpee (none yet) |

`cycle(position, measure, thresholds)` and `hold(position)` return a `Detector`: the counter plus
how it reads a pose, the start heading, the parts to frame, the gauge and the stats line. A cycle
may need a second measure at the bottom (`also`): a squat's hips must drop, not only its knees. The
exercises not rebuilt yet, and `sided`, still call the cycle's `engine` with their own callbacks.

`progress.ts` is what every kind reports to the workout runner: reps, failed reps, held time,
phase and the last attempt. The runner never knows which exercise is running.
