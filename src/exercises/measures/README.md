# measures

What moves in an exercise, as one number per frame that a kind counts on. One file per measure,
named after it (`joint-angle.ts`).

`measure.ts` is what every measure must provide:

- `read(pose, side)`: the number and the joints to draw it with. Null when a joint is hidden.
- `parts`: the body parts it needs in frame, added to the position's.
- `range`: every value it can read; the counter drops anything outside.

A measure reads one side and never picks it: the kind does, because its position needs joints seen
on that side too. When the position's side can't be measured, the kind tries the other side. It knows nothing about thresholds or reps.

| Measure          | Reads                                          | Example         |
| ---------------- | ---------------------------------------------- | --------------- |
| `joint-angle.ts` | the angle at the elbow or knee; 180 = straight | push-up (elbow) |

Planned, each added when its first exercise is rebuilt: height of one joint above another (squat
depth, high knees), and the spread of arms and legs (jumping jack).
