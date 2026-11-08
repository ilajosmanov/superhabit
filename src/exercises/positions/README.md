# positions

Which body position you are in. One file per position, named after it (`plank.ts`). Several
exercises can share one: the plank position serves the plank, and later the push-up.

`position.ts` is what every position must provide:

- `measure`: pose dots → the numbers it needs (angles, heights). Null when joints are out of view.
- `fit`: those numbers → one of three answers:
  - good form (`null`);
  - in the position, form off (hips sagging), with a cue: a hold pauses its clock;
  - out of the position (knees down), with a cue: a hold breaks.
- `ready` and `lost`: the heading while waiting, and the cue after losing track of you.

A position knows nothing about reps or clocks; that is the kind's job. Tune thresholds on recorded
clips, and say in a comment which clips set them.
