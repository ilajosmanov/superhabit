// A pose drawn joint by joint, for tests whose angles should be checkable on paper.
import type { PoseLandmark } from 'superhabit-pose';

import type { Pose } from '@/exercises/body/geometry';

type Point = readonly [x: number, y: number, z?: number];

/**
 * World landmarks in metres (y down) at the given MediaPipe indices; every other joint sits at the
 * origin. Image points are the x–y projection, at visibility 0.9 except `hidden` ones at 0.05.
 */
export function figure(points: Record<number, Point>, hidden: readonly number[] = []): Pose {
  const world = Array.from({ length: 33 }, (): PoseLandmark => ({
    x: 0,
    y: 0,
    z: 0,
    visibility: 0.9,
  }));
  for (const [i, [x, y, z = 0]] of Object.entries(points)) world[+i] = { x, y, z, visibility: 0.9 };
  // The camera looks along z: the frame shows x and y, a 4 m square around the origin.
  const image = world.map(({ x, y }, i): PoseLandmark => ({
    x: 0.5 + x / 4,
    y: 0.5 + y / 4,
    z: 0,
    visibility: hidden.includes(i) ? 0.05 : 0.9,
  }));
  return { landmarks: image, worldLandmarks: world };
}
