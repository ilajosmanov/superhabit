# kinds

How counting works, independent of any exercise. A kind takes one sample per frame and returns the
next state. It is pure: the same state and sample always give the same result.

| Kind          | Counts                                                                            | Example        |
| ------------- | --------------------------------------------------------------------------------- | -------------- |
| `cycle.ts`    | a measure going down and back up in a position: setup at the top, form throughout | push-up, squat |
| `hold.ts`     | time spent in a position; poor form pauses, leaving it breaks                     | plank          |
| `sequence.ts` | positions reached in order, form included, such as standing → plank → standing    | burpee         |

`cycle(position, measure, thresholds)`, `hold(position)` and `sequence(positions, { maxStepMs })`
return a `Detector`: the counter plus
how it reads a pose, the start heading, the parts to frame, the gauge and the stats line. A cycle
may need a second measure at the bottom (`also`), falling or rising: a squat's hips must drop, not
only its knees; a lunge's feet must be a stride apart, so a squat is no lunge. With `up`, it must
be back there too before the rep ends: a jack ends once the arms and the feet have both landed.

Between reps a cycle also watches the top: a bad position held there for 0.8 s (knees down, a sag,
or out of the position altogether, as when standing up) is reported as `told`, and the runner says
its cue once. It is no failed rep and adds no attempt.

`progress.ts` is what every kind reports to the workout runner: reps, failed reps, held time,
phase and the last attempt. The runner never knows which exercise is running.
