import type { HybridObject } from 'react-native-nitro-modules';
import type { Frame } from 'react-native-vision-camera';

export interface PoseLandmark {
  x: number;
  y: number;
  z: number;
  /** 0..1, how likely the joint is visible (not occluded / in frame). */
  visibility: number;
}

export interface PoseCameraPoint {
  x: number;
  y: number;
}

export interface PoseDetection {
  timestampMs: number;
  /** Normalized coordinates in the original, unrotated image buffer. Empty when no person. */
  landmarks: PoseLandmark[];
  /** Metres, origin between the hips. Use these for 3D angles, image landmarks for visibility. */
  worldLandmarks: PoseLandmark[];
  /** Opaque sensor coordinates for CameraRef.convertCameraPointToViewPoint(), not normalized. */
  cameraLandmarks: PoseCameraPoint[];
}

/** MediaPipe Pose Landmarker (BlazePose GHUM, 33 joints in MediaPipe order). */
export interface PoseLandmarker extends HybridObject<{ android: 'kotlin' }> {
  /** Run on a camera frame from a VisionCamera frame-processor worklet (pixelFormat 'rgb'). */
  detect(frame: Frame): void;
  /**
   * Called on the JS thread with every detection (empty arrays when no person), straight from native,
   * so results never cross worklet runtimes. Not called after an error or close().
   */
  onResult: ((result: PoseDetection) => void) | undefined;
  /** Terminal, idempotent shutdown. Pending worklet calls safely do nothing after this returns. */
  close(): void;
}
