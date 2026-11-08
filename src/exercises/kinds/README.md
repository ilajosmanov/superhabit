# kinds

How counting works, independent of any exercise. A kind takes one sample per frame and returns the
next state. It is pure: the same state and sample always give the same result.

| Kind                | Counts                                                         | Example           |
| ------------------- | -------------------------------------------------------------- | ----------------- |
| `cycle.ts`          | one signal going down and back up is one rep                   | squat             |
| `sided.ts`          | a cycle on each side, counted together                         | lunge             |
| `position-cycle.ts` | a cycle gated by a position: setup at the top, form throughout | push-up           |
| `hold.ts`           | time spent in a position; poor form pauses, leaving it breaks  | plank             |
| `sequence.ts`       | named poses in order, such as standing → plank → standing      | burpee (none yet) |

`progress.ts` is what every kind reports to the workout runner: reps, failed reps, held time,
phase and the last attempt. The runner never knows which exercise is running.
