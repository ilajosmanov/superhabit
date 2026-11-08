import { describe, expect, it } from 'vite-plus/test';
import { Joint } from 'superhabit-pose/joints';

import { body } from '@/exercises/__fixtures__/body';
import { jointAngle } from './joint-angle';
import { bothSides } from './measure';

const knees = bothSides(jointAngle('knee'), 35);
/** Standing, with the left knee bent to `deg`: the thigh tilts forward, the shin stays upright. */
const leftKnee = (deg: number) => {
  const pose = body({});
  const hip = pose.worldLandmarks[Joint.LEFT_HIP];
  const knee = pose.worldLandmarks[Joint.LEFT_KNEE];
  const rad = ((180 - deg) * Math.PI) / 180;
  pose.worldLandmarks[Joint.LEFT_HIP] = {
    ...hip,
    y: knee.y - 0.45 * Math.cos(rad),
    z: knee.z + 0.45 * Math.sin(rad),
  };
  return pose;
};

describe('bothSides', () => {
  it('reads the straighter of two knees that agree', () => {
    expect(knees.read(leftKnee(150), 'left')?.value).toBeCloseTo(180);
  });

  it('reads nothing when the knees differ by more than the gap', () => {
    expect(knees.read(leftKnee(140), 'left')).toBeNull();
  });

  it('reads the side asked for alone when the other is hidden', () => {
    const pose = leftKnee(100);
    pose.landmarks[Joint.RIGHT_KNEE] = { ...pose.landmarks[Joint.RIGHT_KNEE], visibility: 0.2 };
    expect(knees.read(pose, 'left')).toEqual({
      value: expect.closeTo(100),
      joints: [Joint.LEFT_HIP, Joint.LEFT_KNEE, Joint.LEFT_ANKLE],
    });
    expect(knees.read(pose, 'right')).toBeNull();
  });
});
