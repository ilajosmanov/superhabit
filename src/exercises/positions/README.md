# positions

Which body position you are in. One file per position, named after it (`plank.ts`); several
exercises share one.

| File            | Position                                             | Exercises                               |
| --------------- | ---------------------------------------------------- | --------------------------------------- |
| `plank.ts`      | plank, forearm or high, side-on                      | plank, push-up, burpee                  |
| `standing.ts`   | standing (`standingPosition`)                        | squat, side squat, jumping jack, burpee |
|                 | standing with the torso kept up (`uprightPosition`)  | lunge                                   |
| `back.ts`       | on your back, knees bent (`kneesBentPosition`)       | sit-up, glute bridge                    |
|                 | on your back, legs straight (`legsStraightPosition`) | leg raise                               |
| `seated.ts`     | seated in the air (`inTheAirPosition`)               | wall sit                                |
| `side-plank.ts` | on one forearm, facing the phone                     | side plank                              |

Variants in one file share one reading and differ in their checks.

`position.ts` is what every position must provide:

- `read`: pose dots → the numbers it needs (angles, heights), and the side it read. It picks the
  better-seen side for one-sided positions; side plank reads both sides and returns no side. Null when
  joints are out of view.
- `parts`: the body parts that must be in frame to start.
- `setup`: are you in the position at all (knees down is not a plank)? Judged at rest only: through
  a hold, and at the top of each rep. A movement passes through shapes that would fail it: the
  arms tuck in at the bottom of a push-up.
- `form`: is the form good (hips sagging)? Judged on every frame, through the movement too.
- `ready` and `lost`: the heading while waiting, and the cue after losing track of you.

A position judges what is off the floor by the phone's gravity (`gravity(pose)`) and reads nothing
without it: shape alone can't tell lying or standing from a plank. Tune it on device clips with
gravity, labelled from their video.

A bend the camera sees side-on (the hips off a plank's body line, a knee off its leg's line) is read in the picture
(`pictured(pose, i)`), not from the world landmarks: there the same straight plank read anywhere from
−0.39 to 0.14 forearms off its line, clip to clip, and a pike that showed on the skeleton passed. In
the picture a straight body is straight from any camera tilt or roll; gravity only says which way
the hips are off. A bend grows as the body turns to the lens, so past 45° the plank reads nothing.
A bent knee in the picture is on the floor only if the world landmarks put it low too: a burpee's
kick-back bends the knees in the air, and loose shorts make the world guess a straight leg's knee low.

A position knows nothing about reps or clocks; that is the kind's job. Tune thresholds on recorded
clips, and say in a comment which clips set them.
