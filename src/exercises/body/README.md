# body

Reading the pose dots, shared by positions, measures and kinds. Nothing here knows about exercises.

| File          | Does                                                                      |
| ------------- | ------------------------------------------------------------------------- |
| `geometry.ts` | the `Pose` type, vector maths, joint angles, visibility, better-seen side |
| `smooth.ts`   | the 1€ filter that steadies a signal, with its state as plain data        |
| `trace.ts`    | the recorded-clip format: saved from the camera, replayed in tests        |
