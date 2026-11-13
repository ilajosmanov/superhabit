# pose

The native pose detector: MediaPipe Pose Landmarker (tasks-vision 1.2.2, BlazePose GHUM full) as a Nitro
module that VisionCamera frame processors call, on Android (Kotlin) and iOS (Swift, MediaPipeTasksVision 1.0.1).

| File                                | Does                                                                    |
| ----------------------------------- | ----------------------------------------------------------------------- |
| `src/pose-landmarker.nitro.ts`      | the contract: `PoseLandmarker`, `PoseDetection` and their fields        |
| `src/landmarker.ts`                 | the package entry: `createPoseLandmarker()` and the types               |
| `src/joints.ts`                     | the 33 joint indices, plain data so Node tests can load it              |
| `android/…/HybridPoseLandmarker.kt` | runs MediaPipe on each frame and pushes a `PoseDetection` to `onResult` |
| `nitrogen/generated/`               | generated from the contract; never edit by hand                         |

Every detection carries, besides the points: `down` (gravity), `brightness` (mean luma 0..255 from a 32×32
grid of pixels), `inferenceMs` (the MediaPipe call alone), `frameWidth`/`frameHeight` (upright),
`rotation` (0/90/180/270 clockwise to upright) and `delegate` (`gpu`, or `cpu` when GPU creation or inference fails).
Three consecutive detection exceptions on GPU recreate the detector on CPU once. Three consecutive
exceptions on CPU, failed CPU creation, unsupported frames or missing gravity sensors call `onFailed`
once and stop detection. A successful detection resets the failure count.
Image landmarks carry `presence` when MediaPipe fills it; world landmarks never do.

After changing the contract, regenerate from this folder with the same Nitrogen as
`react-native-nitro-modules` (0.37.2): `vp dlx nitrogen@0.37.2`. Nitrogen rejects inline unions, so name
them (`PoseDelegate`). Then rebuild the app (`vp run android`).

On the phone, `adb logcat -s PoseLandmarker` prints every 5 s: fps, ms per frame, delegate, inference ms,
brightness, the nose's presence and `down`.

On iOS (`ios/HybridPoseLandmarker.swift`), MediaPipe answers in the raw buffer as on Android, so the
same `upright` turn applies. The turn comes from the back camera's mount and the interface orientation,
not VisionCamera's `frame.orientation`, which flips between 90 and 270 in a portrait-locked workout; the
preview conversion still gets the point turned by VisionCamera's value. Gravity comes from CoreMotion,
negated to Android's "up". Measured on an iPhone 13 with the back camera upright: points, `down` and the
skeleton match Android. Unmeasured: the front camera's turn and mirroring, and landscape. Read the
5-second log line in Console.app (category `PoseLandmarker`).
