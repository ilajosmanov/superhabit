import { NitroModules } from 'react-native-nitro-modules';

import type { PoseLandmarker } from './PoseLandmarker.nitro';

export type {
  PoseCameraPoint,
  PoseDetection,
  PoseLandmark,
  PoseLandmarker,
} from './PoseLandmarker.nitro';

export const createPoseLandmarker = () =>
  NitroModules.createHybridObject<PoseLandmarker>('PoseLandmarker');
