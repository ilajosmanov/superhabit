import { describe, expect, it } from 'vite-plus/test';
import { Joint } from 'superhabit-pose/joints';

import { body } from '@/exercises/__fixtures__/body';
import { plank } from '@/exercises/__fixtures__/plank';
import { jointAngle } from './joint-angle';

const elbow = jointAngle('elbow');
const knee = jointAngle('knee');

describe('jointAngle', () => {
  it('reads the elbow on the side asked for, with its shoulder, elbow and wrist', () => {
    expect(elbow.read(plank({ elbow: 80 }), 'left')).toEqual({
      value: expect.closeTo(80),
      joints: [Joint.LEFT_SHOULDER, Joint.LEFT_ELBOW, Joint.LEFT_WRIST],
    });
    expect(elbow.read(plank({ elbow: 170, visible: 'right' }), 'right')?.value).toBeCloseTo(170);
  });

  it('reads the knee: 180 standing straight, 180 − thigh − shin when bent', () => {
    expect(knee.read(body({}), 'right')).toEqual({
      value: expect.closeTo(180),
      joints: [Joint.RIGHT_HIP, Joint.RIGHT_KNEE, Joint.RIGHT_ANKLE],
    });
    expect(knee.read(body({ thigh: 70, shin: 25 }), 'right')?.value).toBeCloseTo(85);
  });

  it('is null when a joint of that side is hidden or out of frame', () => {
    // The fixture's far (right) side has visibility 0.1.
    expect(elbow.read(plank({}), 'right')).toBeNull();
    const cropped = plank({});
    cropped.landmarks[Joint.LEFT_WRIST] = { ...cropped.landmarks[Joint.LEFT_WRIST], x: 1.1 };
    expect(elbow.read(cropped, 'left')).toBeNull();
  });

  it('is null when two joints coincide and the angle is undefined', () => {
    const pose = plank({});
    pose.worldLandmarks[Joint.LEFT_ELBOW] = pose.worldLandmarks[Joint.LEFT_SHOULDER];
    expect(elbow.read(pose, 'left')).toBeNull();
  });
});
