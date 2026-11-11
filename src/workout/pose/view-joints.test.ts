import { expect, it, vi } from 'vite-plus/test';

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
