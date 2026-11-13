# body

Reading the pose dots, shared by positions, measures and kinds. Nothing here knows about exercises.

| File          | Does                                                                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `geometry.ts` | the `Pose` type (with gravity when the phone gives it), vector maths, joint angles, a joint in the picture, visibility, better-seen side, whether the dots can be a body |
| `smooth.ts`   | the 1€ filter that steadies a signal, with its state as plain data                                                                                                       |
