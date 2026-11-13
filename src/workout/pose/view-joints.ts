import type { SkPoint } from '@shopify/react-native-skia';
import type { CameraRef } from 'react-native-vision-camera';
import type { PoseDetection } from 'reprepgo-pose';

import { JOINTS } from './skeleton';
import { inFrame } from '@/exercises/body/geometry';

/**
 * 33 entries in MediaPipe order, view coordinates; null where the counters wouldn't trust the joint
 * either (not visible enough, or guessed outside the picture: those leap about) or it is not finite.
 * The native transform includes the preview's cover scaling and, on the front camera, its mirroring.
 */
export function toViewJoints(
  preview: Pick<CameraRef, 'convertCameraPointToViewPoint'> | null,
  result: PoseDetection,
  drawSkeleton: boolean,
): (SkPoint | null)[] {
  if (!drawSkeleton) return [];
  const none = () => Array.from({ length: JOINTS }, () => null);
  if (!preview) return none();
  try {
    return Array.from({ length: JOINTS }, (_, i) => {
      const point = result.cameraLandmarks[i];
      if (!point || !inFrame(result.landmarks[i])) return null;
      const view = preview.convertCameraPointToViewPoint(point);
      return Number.isFinite(view.x) && Number.isFinite(view.y) ? view : null;
    });
  } catch {
    // CameraX has no sensor-to-view transform until the preview is ready.
    return none();
  }
}
