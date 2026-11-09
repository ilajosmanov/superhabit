import type { SkPoint } from '@shopify/react-native-skia';
import { useRef, type RefObject } from 'react';
import { Dimensions } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import type { CameraRef } from 'react-native-vision-camera';

import type { Live } from '@/workout/counting';
import type { PoseDetection } from 'superhabit-pose';

import { filterJoints, type JointFilter } from './joint-filter';
import { toViewJoints } from './pose-camera';

/**
 * The per-frame overlay: shared values written from each detector result and read on the UI thread
 * by Skia and the gauge, never React state. `onPose` is the session's per-frame callback.
 */
export function usePoseOverlay(camera: RefObject<CameraRef | null>) {
  const joints = useSharedValue<(SkPoint | null)[]>([]);
  const filter = useRef<JointFilter | null>(null);
  const highlight = useSharedValue<readonly [number, number, number] | null>(null);
  const angle = useSharedValue<number | null>(null);
  const lowest = useSharedValue<number | null>(null);
  const onPose = (result: PoseDetection, live: Live) => {
    // Read at call time: the window turns when the orientation lock lands.
    const { width, height } = Dimensions.get('window');
    const view = toViewJoints(camera.current, result);
    const smoothed = filterJoints(
      filter.current,
      view,
      result.timestampMs / 1000,
      Math.hypot(width, height),
    );
    filter.current = smoothed.state;
    joints.set(smoothed.points);
    highlight.set(live.joints);
    angle.set(live.angle);
    lowest.set(live.lowest);
  };
  return { joints, highlight, angle, lowest, onPose };
}
