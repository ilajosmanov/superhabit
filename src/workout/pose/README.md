# pose

The camera and drawing boundary, owned by workout UI.

| File              | Holds                                                                 |
| ----------------- | --------------------------------------------------------------------- |
| `pose-camera.tsx` | camera frames to the landmarker, preview coordinates and Skia drawing |
| `overlay.ts`      | detector results to shared values for the skeleton and gauge          |
| `joint-filter.ts` | smoothing, dropout holds and jump resets for view-space joints        |
| `skeleton.ts`     | visible bones, highlighted limb, dots and angle arc                   |

Tests beside `joint-filter.ts` and `skeleton.ts` cover their pure calculations.
