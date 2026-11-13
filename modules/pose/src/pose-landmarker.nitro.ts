import type { HybridObject } from 'react-native-nitro-modules';
import type { Frame } from 'react-native-vision-camera';

export interface PoseLandmark {
  x: number;
  y: number;
  z: number;
  /** 0..1, how likely the joint is visible (not occluded / in frame). */
  visibility: number;
  /** 0..1, how likely the joint is inside the frame; image landmarks only, absent when MediaPipe gives none. */
  presence?: number;
}

export interface PoseCameraPoint {
  x: number;
  y: number;
}

export interface PoseVector {
  x: number;
  y: number;
  z: number;
}

/** Where MediaPipe ran. A named type because Nitrogen rejects inline unions. */
export type PoseDelegate = 'gpu' | 'cpu';

export interface PoseDetection {
  timestampMs: number;
  /** Normalized 0..1 coordinates, rotated upright to the screen. Empty when no person. */
  landmarks: PoseLandmark[];
  /** Metres, origin between the hips. Use these for 3D angles, image landmarks for visibility. */
  worldLandmarks: PoseLandmark[];
  /** Which way is down, unit length, in the worldLandmarks axes, from the phone's gravity sensor. Absent without one. */
  down?: PoseVector;
  /** Opaque sensor coordinates for CameraRef.convertCameraPointToViewPoint(), not normalized. */
  cameraLandmarks: PoseCameraPoint[];
  /** Mean luma of the analysed frame, 0..255. */
  brightness: number;
  /** Time spent in MediaPipe for this frame, ms. */
  inferenceMs: number;
  /** The analysed frame in pixels, upright (after `rotation`). */
  frameWidth: number;
  frameHeight: number;
  /** Clockwise degrees the camera buffer was turned to be upright: 0, 90, 180 or 270. */
  rotation: number;
  delegate: PoseDelegate;
}

/** MediaPipe Pose Landmarker (BlazePose GHUM, 33 joints in MediaPipe order). */
export interface PoseLandmarker extends HybridObject<{ android: 'kotlin'; ios: 'swift' }> {
  /**
   * Run on a camera frame from a VisionCamera frame-processor worklet (pixelFormat 'rgb'). `front`:
   * the frame is from the front camera, which flips gravity's x; z is the same for both cameras.
   */
  detect(frame: Frame, front: boolean): void;
  /**
   * Called on the JS thread with every detection (empty arrays when no person), straight from native,
   * so results never cross worklet runtimes. Not called after onFailed or close().
   */
  onResult: ((result: PoseDetection) => void) | undefined;
  /**
   * Called once on the JS thread when frames, gravity or GPU/CPU detection fail: nothing will be detected for
   * the rest of this instance's life. `message` is the native error, for the log.
   */
  onFailed: ((message: string) => void) | undefined;
  /** Terminal, idempotent shutdown. Pending worklet calls safely do nothing after this returns. */
  close(): void;
}
