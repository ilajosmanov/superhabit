import { Canvas, Points, type SkPoint } from '@shopify/react-native-skia';
import type { RefObject } from 'react';
import { StyleSheet, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import {
  Camera,
  CommonResolutions,
  useAsyncRunner,
  useFrameOutput,
  type CameraRef,
} from 'react-native-vision-camera';
import type { PoseDetection, PoseLandmarker } from 'superhabit-pose';

import { colors } from '@/theme';

const CAMERA = 'front';
// The VGA 4:3 frame, as width / height in portrait.
const FRAME_ASPECT = 3 / 4;

/** Visible landmarks in preview coordinates; the native transform includes front-camera mirroring. */
export function toViewPoints(preview: CameraRef | null, result: PoseDetection): SkPoint[] {
  if (!preview) return [];
  try {
    return result.cameraLandmarks
      .filter((_, i) => (result.landmarks[i]?.visibility ?? 0) > 0.5)
      .map((point) => preview.convertCameraPointToViewPoint(point))
      .filter(({ x, y }) => Number.isFinite(x) && Number.isFinite(y));
  } catch {
    // CameraX has no sensor-to-view transform until the preview is ready.
    return [];
  }
}

/** Front camera feeding every frame to the landmarker, with the pose dots drawn over the preview. */
export function PoseCamera({
  cameraRef,
  landmarker,
  dots,
  isActive,
  landscape,
}: {
  cameraRef: RefObject<CameraRef | null>;
  landmarker: PoseLandmarker | null;
  /** Drawn by Skia on the UI thread straight from this shared value. */
  dots: SharedValue<SkPoint[]>;
  isActive: boolean;
  landscape: boolean;
}) {
  const asyncRunner = useAsyncRunner();
  const frameOutput = useFrameOutput({
    targetResolution: CommonResolutions.VGA_4_3,
    pixelFormat: 'rgb', // CameraX converts to RGBA; the native detector copies it to a Bitmap.
    onFrame(frame) {
      'worklet';
      // No `finally` here or below: React Compiler skips any component that uses one.
      let accepted = false;
      try {
        if (landmarker) {
          accepted = asyncRunner.runAsync(() => {
            'worklet';
            // The runner only clears its busy flag when this task returns normally, so never throw.
            // Results reach JS through the detector's native onResult callback, not across runtimes.
            try {
              try {
                landmarker.detect(frame);
              } catch (error) {
                console.error('[pose] frame processing failed', error);
              }
              frame.dispose();
            } catch (error) {
              console.error('[pose] frame dispose failed', error);
            }
          });
        }
      } catch (error) {
        console.error('[pose] frame scheduling failed', error);
      }
      if (!accepted) frame.dispose();
    },
  });

  return (
    // Layout only; CameraX's sensor-to-view transform maps the dots to the preview.
    <View
      style={
        landscape
          ? { height: '100%', aspectRatio: 1 / FRAME_ASPECT }
          : { width: '100%', aspectRatio: FRAME_ASPECT }
      }
    >
      <Camera
        ref={cameraRef}
        style={{ flex: 1 }}
        device={CAMERA}
        isActive={isActive}
        orientationSource="interface"
        resizeMode="contain"
        outputs={[frameOutput]}
      />
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        <Points
          points={dots}
          mode="points"
          color={colors.accent}
          strokeWidth={10}
          strokeCap="round"
        />
      </Canvas>
    </View>
  );
}
