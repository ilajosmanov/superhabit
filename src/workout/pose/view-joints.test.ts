import { expect, it, vi } from 'vite-plus/test';

import { Joint } from 'reprepgo-pose/joints';

import { body, detection } from '@/exercises/__fixtures__/body';
import { toViewJoints } from './view-joints';

it('skips native coordinate conversions while hidden and resumes them when shown', () => {
  const pose = body({});
  const result = { ...detection(pose, 0), cameraLandmarks: pose.landmarks };
  const convertCameraPointToViewPoint = vi.fn(() => ({ x: 24, y: 48 }));
  const preview = { convertCameraPointToViewPoint };
  expect(toViewJoints(preview, result, false)).toEqual([]);
  expect(convertCameraPointToViewPoint).not.toHaveBeenCalled();
  toViewJoints(preview, result, true);
  expect(convertCameraPointToViewPoint).toHaveBeenCalled();
});

it('leaves out a joint the detector guessed outside the picture, however sure it is', () => {
  const pose = body({});
  pose.landmarks[Joint.LEFT_KNEE] = { x: 0.5, y: 1.2, z: 0, visibility: 0.9 };
  const result = { ...detection(pose, 0), cameraLandmarks: pose.landmarks };
  const view = toViewJoints(
    { convertCameraPointToViewPoint: () => ({ x: 24, y: 48 }) },
    result,
    true,
  );
  expect(view[Joint.LEFT_KNEE]).toBeNull();
  expect(view[Joint.RIGHT_KNEE]).toEqual({ x: 24, y: 48 });
});
