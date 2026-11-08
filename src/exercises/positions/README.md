# positions

Which body position you are in. One file per position, named after it (`plank.ts`). Several
exercises share one: the plank position serves the plank and the push-up.

`position.ts` is what every position must provide:

- `read`: pose dots → the numbers it needs (angles, heights), and the side it read. It picks the
  better-seen side. Null when joints are out of view.
- `parts`: the body parts that must be in frame to start.
- `setup`: are you in the position at all (knees down is not a plank)? Judged at rest only: through
  a hold, and at the top of each rep. A movement passes through shapes that would fail it: the
  arms tuck in at the bottom of a push-up.
- `form`: is the form good (hips sagging)? Judged on every frame, through the movement too.
- `ready` and `lost`: the heading while waiting, and the cue after losing track of you.

With the phone's gravity (`gravity(pose)`), a position judges what is off the floor; without it
(older clips) it falls back to shape alone, which can't tell lying or standing from a plank.

A position knows nothing about reps or clocks; that is the kind's job. Tune thresholds on recorded
clips, and say in a comment which clips set them.
