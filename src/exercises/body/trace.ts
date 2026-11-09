import type { PoseDetection } from 'superhabit-pose';

import type { Pose } from './geometry';

export type TracePoint = readonly [x: number, y: number, z: number, visibility: number];
export type TraceFrame = {
  t: number;
  landmarks: readonly TracePoint[];
  world: readonly TracePoint[];
  /** Gravity in the world axes; absent in clips recorded without it. */
  down?: readonly [x: number, y: number, z: number];
};

export function toPose(frame: TraceFrame): Pose {
  const landmark = ([x, y, z, visibility]: TracePoint) => ({ x, y, z, visibility });
  return {
    landmarks: frame.landmarks.map(landmark),
    worldLandmarks: frame.world.map(landmark),
    ...(frame.down && { down: { x: frame.down[0], y: frame.down[1], z: frame.down[2] } }),
  };
}

export function toFrame(result: PoseDetection, t0: number): TraceFrame {
  const point = ({ x, y, z, visibility }: Pose['landmarks'][number]): TracePoint => [
    x,
    y,
    z,
    visibility,
  ];
  return {
    t: result.timestampMs - t0,
    landmarks: result.landmarks.map(point),
    world: result.worldLandmarks.map(point),
    ...(result.down && { down: [result.down.x, result.down.y, result.down.z] as const }),
  };
}
