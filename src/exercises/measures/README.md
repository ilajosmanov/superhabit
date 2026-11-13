# measures

What moves in an exercise, as one number per frame that a kind counts on. One file per measure,
named after it (`joint-angle.ts`).

`measure.ts` is what every measure must provide:

- `read(pose, side)`: the number and the joints to draw it with. Null when a joint is hidden.
- `parts`: the body parts it needs in frame, added to the position's.
- `range`: every value it can read; the counter drops anything outside.

A measure reads one side and never picks it: the kind does, because its position needs joints seen
on that side too. When the position's side can't be measured, the kind tries the other side. It knows nothing about thresholds or reps.

| Measure          | Reads                                                  | Example                                       |
| ---------------- | ------------------------------------------------------ | --------------------------------------------- |
| `joint-angle.ts` | the angle at the elbow, knee, hip or shoulder          | push-up (elbow), glute bridge (hip)           |
| `elevation.ts`   | how far a segment rises over level by gravity, degrees | squat's thighs, sit-up's torso, bridge's hips |
| `spread.ts`      | the feet apart, forward or sideways, in leg lengths    | lunge's stride, jumping jack's legs           |

`jointAngle(bend, 'picture')` reads the angle as the camera saw it instead of from the world landmarks:
for a limb that bends side-on to the lens (a push-up's elbow, a bridge's hip line), where the world
guess of the same bend read 65–115° at the floor, clip to clip.

`bothSides(measure, gap, read)` (in `measure.ts`) reads both limbs when both are seen: `read` is
`'higher'` (the default) or `'lower'`. It returns the chosen value, or
nothing when they differ by more than `gap`; with one seen, that one alone. A squat's knees move
together; one alone is a kick.
