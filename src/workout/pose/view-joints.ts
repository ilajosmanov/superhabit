import type { SkPoint } from '@shopify/react-native-skia';
import type { CameraRef } from 'react-native-vision-camera';
import type { PoseDetection } from 'reprepgo-pose';

import { JOINTS } from './skeleton';
import { MIN_VISIBILITY } from '@/exercises/body/geometry';

/**
 * 33 entries in MediaPipe order, view coordinates; null where not visible enough or not finite.
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
      if (!point || (result.landmarks[i]?.visibility ?? 0) < MIN_VISIBILITY) return null;
      const view = preview.convertCameraPointToViewPoint(point);
      return Number.isFinite(view.x) && Number.isFinite(view.y) ? view : null;
    });
  } catch {
    // CameraX has no sensor-to-view transform until the preview is ready.
    return none();
  }
}
