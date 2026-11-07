import { NitroModules } from 'react-native-nitro-modules';

import type { PoseLandmarker } from './pose-landmarker.nitro';

export type {
  PoseCameraPoint,
  PoseDetection,
  PoseLandmark,
  PoseLandmarker,
} from './pose-landmarker.nitro';

export const createPoseLandmarker = () =>
  NitroModules.createHybridObject<PoseLandmarker>('PoseLandmarker');
