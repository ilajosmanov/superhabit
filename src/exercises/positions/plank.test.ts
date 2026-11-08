import { assert, describe, expect, it } from 'vite-plus/test';
import { Joint } from 'superhabit-pose/joints';

import { plank as pose } from '@/exercises/__fixtures__/plank';
import { measurePlank, plankPosition } from './plank';
import { fit } from './position';

describe('measurePlank', () => {
  it.each([false, true])('reads a straight body and knees with forearms=%s', (forearms) => {
    const sample = measurePlank(pose({ forearms }));
    assert(sample);
    expect(sample.body).toBeCloseTo(180);
    expect(sample.knees).toBeCloseTo(180);
    expect(sample.reach).toBeGreaterThanOrEqual(50);
    expect(sample.reach).toBeLessThanOrEqual(120);
  });

  it('uses the better-seen side and reports the body-line joints', () => {
    expect(measurePlank(pose({ visible: 'right', sag: 40 }))).toMatchObject({
      body: expect.closeTo(140),
      joints: [Joint.RIGHT_SHOULDER, Joint.RIGHT_HIP, Joint.RIGHT_ANKLE],
    });
  });

  it('uses the other side when the near knee is hidden', () => {
    const body = pose({ visible: 'both' });
    body.landmarks[Joint.LEFT_KNEE].visibility = 0.05;
    expect(measurePlank(body)?.joints).toEqual([
      Joint.RIGHT_SHOULDER,
      Joint.RIGHT_HIP,
      Joint.RIGHT_ANKLE,
    ]);
  });

  it('prefers the clear far side over a barely visible near ankle', () => {
    const body = pose({ visible: 'both' });
    body.landmarks[Joint.LEFT_ANKLE].visibility = 0.11;
    for (const joint of [
      Joint.RIGHT_SHOULDER,
      Joint.RIGHT_ELBOW,
      Joint.RIGHT_WRIST,
      Joint.RIGHT_HIP,
      Joint.RIGHT_KNEE,
      Joint.RIGHT_ANKLE,
    ])
      body.landmarks[joint].visibility = 0.8;
    expect(measurePlank(body)?.joints).toEqual([
      Joint.RIGHT_SHOULDER,
      Joint.RIGHT_HIP,
      Joint.RIGHT_ANKLE,
    ]);
  });

  it('rejects a cropped wrist even with the tuned visibility threshold', () => {
    const body = pose({});
    body.landmarks[Joint.LEFT_WRIST].x = 1.1;
    body.landmarks[Joint.RIGHT_WRIST].x = 1.1;
    expect(measurePlank(body)).toBeNull();
  });

  it.each(['x', 'y', 'visibility'] as const)('rejects ankles with invalid %s', (field) => {
    const body = pose({});
    for (const ankle of [Joint.LEFT_ANKLE, Joint.RIGHT_ANKLE])
      body.landmarks[ankle][field] = field === 'visibility' ? 0.05 : 1.1;
    expect(measurePlank(body)).toBeNull();
  });

  it.each(['x', 'visibility'] as const)(
    'chooses the other side when the near ankle has invalid %s',
    (field) => {
      const body = pose({ visible: 'both' });
      body.landmarks[Joint.LEFT_ANKLE][field] = field === 'visibility' ? 0.05 : 1.1;
      const sample = measurePlank(body);
      assert(sample);
      expect(sample.joints).toEqual([Joint.RIGHT_SHOULDER, Joint.RIGHT_HIP, Joint.RIGHT_ANKLE]);
      expect(fit(plankPosition, sample)).toBeNull();
    },
  );

  it('rejects coincident joints instead of passing an invalid angle to the hold', () => {
    const body = pose({});
    body.worldLandmarks[Joint.LEFT_KNEE] = body.worldLandmarks[Joint.LEFT_HIP];
    expect(measurePlank(body)).toBeNull();
  });
});
