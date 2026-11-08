# measures

What moves in an exercise, as one number per frame that a kind counts on. One file per measure,
named after it (`joint-angle.ts`).

`measure.ts` is what every measure must provide:

- `joints(side)`: the joints it reads, so the exercise can pick a side where they are all seen.
- `read(pose, side)`: the number and the joints to draw it with. Null when a joint is hidden.

A measure reads one side and never picks it: the exercise does, because its position needs joints
seen on that side too. It knows nothing about thresholds or reps.

| Measure          | Reads                                          | Example         |
| ---------------- | ---------------------------------------------- | --------------- |
| `joint-angle.ts` | the angle at the elbow or knee; 180 = straight | push-up (elbow) |

Planned, each added when its first exercise is rebuilt: height of one joint above another (squat
depth, high knees), and the spread of arms and legs (jumping jack).
