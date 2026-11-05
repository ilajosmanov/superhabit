// Synthetic MediaPipe poses for tests.
import type { PoseLandmark } from 'superhabit-pose';
import { Joint } from 'superhabit-pose/joints';

import type { Pose } from '../geometry';

type Body = { thigh?: number; shin?: number; lean?: number; knees?: number; side?: boolean };
/**
 * World landmarks (metres, y down, origin at the hips, camera toward −z); image points all in frame.
 * `thigh` / `shin` tilt from vertical, so the knee angle is 180 − thigh − shin.
 * `knees`: knee half-width with ankles at 0.1 (valgus ratio = knees / 0.1).
 */
export const body = ({ thigh = 0, shin = 0, lean = 0, knees = 0.1, side = false }: Body): Pose => {
  const rad = Math.PI / 180;
  const L = 0.45;
  const world = Array.from({ length: 33 }, (): PoseLandmark => ({
    x: 0,
    y: 0,
    z: 0,
    visibility: 0.9,
  }));
  const put = (i: number, x: number, y: number, z: number) => {
    world[i] = side ? { x: z, y, z: x, visibility: 0.9 } : { x, y, z, visibility: 0.9 };
  };
  for (const sign of [-1, 1]) {
    const [shoulder, hip, knee, ankle] =
      sign < 0
        ? [Joint.LEFT_SHOULDER, Joint.LEFT_HIP, Joint.LEFT_KNEE, Joint.LEFT_ANKLE]
        : [Joint.RIGHT_SHOULDER, Joint.RIGHT_HIP, Joint.RIGHT_KNEE, Joint.RIGHT_ANKLE];
    const ky = L * Math.cos(thigh * rad);
    const kz = -L * Math.sin(thigh * rad);
    put(shoulder, sign * 0.18, -0.5 * Math.cos(lean * rad), -0.5 * Math.sin(lean * rad));
    put(hip, sign * 0.1, 0, 0);
    put(knee, sign * knees, ky, kz);
    put(ankle, sign * 0.1, ky + L * Math.cos(shin * rad), kz + L * Math.sin(shin * rad));
  }
  const image = world.map((): PoseLandmark => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }));
  return { landmarks: image, worldLandmarks: world };
};
