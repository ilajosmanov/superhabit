# pose

The camera and drawing boundary, owned by workout UI.

| File              | Holds                                                                           |
| ----------------- | ------------------------------------------------------------------------------- |
| `pose-camera.tsx` | camera frames to the landmarker and Skia skeleton drawing                       |
| `view-joints.ts`  | visible detector points to preview coordinates; skips native calls while hidden |
| `overlay.ts`      | detector results to shared values for the skeleton and gauge                    |
| `joint-filter.ts` | smoothing, dropout holds and jump resets for view-space joints                  |
| `skeleton.ts`     | visible bones, highlighted limb, dots and angle arc                             |

Tests beside `joint-filter.ts` and `skeleton.ts` cover their pure calculations; `view-joints.test.ts`
checks that a hidden skeleton makes no native coordinate conversions.

Skeleton conversion and picture drawing stop when toggled off and during rests. Paused frames keep
drawing idle dots for re-aiming the phone. Done hides the dots and deactivates the camera. Gauge angles
still update; showing the skeleton again starts with a fresh joint filter.
