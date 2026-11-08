import { assert, describe, expect, it } from 'vite-plus/test';
import { Joint } from 'superhabit-pose/joints';

import { plank as pose } from '@/exercises/__fixtures__/plank';
import type { Vec } from '@/exercises/body/geometry';
import { measurePlank, plankPosition } from './plank';

describe('measurePlank', () => {
  it('reads heights above the wrists along gravity, in forearm lengths', () => {
    // Fixture: shoulders 0.58 m up, hips halfway to the ankles, knees halfway again; forearm 0.28 m.
    const sample = measurePlank(pose({}));
    assert(sample);
    expect(sample.hip).toBeCloseTo(0.29 / 0.28, 1);
    expect(sample.knee).toBeCloseTo(0.145 / 0.28, 1);
    expect(sample.drop).toBeCloseTo(0);
    expect(sample.rise).toBeCloseTo(22.6, 0);
    expect(sample.reach).toBeGreaterThanOrEqual(50);
    expect(sample.reach).toBeLessThanOrEqual(120);
  });

  it('reads a sag as the hip below the body line, and a pike above it', () => {
    expect(measurePlank(pose({ sag: 40 }))?.drop).toBeGreaterThan(0.4);
    const piked = pose({});
    for (const hip of [Joint.LEFT_HIP, Joint.RIGHT_HIP]) piked.worldLandmarks[hip].y -= 0.3;
    expect(measurePlank(piked)?.drop).toBeLessThan(-0.6);
  });

  it('reads nothing without gravity: shape alone is the same turned on end', () => {
    expect(measurePlank({ ...pose({}), down: undefined })).toBeNull();
  });

  it('uses the better-seen side and reports the body-line joints', () => {
    expect(measurePlank(pose({ visible: 'right' }))?.joints).toEqual([
      Joint.RIGHT_SHOULDER,
      Joint.RIGHT_HIP,
      Joint.RIGHT_ANKLE,
    ]);
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

  it('reads the far knee down on the floor only when it is clearly seen', () => {
    const body = pose({});
    body.worldLandmarks[Joint.RIGHT_KNEE].y = 0;
    expect(measurePlank(body)?.knee).toBeCloseTo(0.145 / 0.28, 1);
    body.landmarks[Joint.RIGHT_KNEE].visibility = 0.7;
    expect(measurePlank(body)?.knee).toBeCloseTo(0);
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
      expect(plankPosition.setup(sample) ?? plankPosition.form(sample)).toBeNull();
    },
  );

  it('rejects coincident joints instead of passing an invalid angle to the hold', () => {
    const body = pose({});
    body.worldLandmarks[Joint.LEFT_SHOULDER] = body.worldLandmarks[Joint.LEFT_HIP];
    expect(measurePlank(body)).toBeNull();
  });
});

describe('plankPosition.setup', () => {
  it('turns away the same shape stood on end', () => {
    // The fixture lies along +x on a floor at y = 0, so gravity is +y; along x it stands on end.
    const setup = (down: Vec) => {
      const sample = measurePlank({ ...pose({}), down });
      assert(sample);
      return plankPosition.setup(sample);
    };
    expect(setup({ x: 0, y: 1, z: 0 })).toBeNull();
    expect(setup({ x: -1, y: 0, z: 0 })).toBe('Get down into a plank');
  });

  it('tells lying (hips down, body straight) from a sag (hips down, bent)', () => {
    const lying = measurePlank(pose({}));
    assert(lying);
    expect(plankPosition.setup({ ...lying, hip: 0.2, drop: 0.2 })).toBe('Get into a plank');
    expect(plankPosition.setup({ ...lying, hip: 0.2, drop: 0.9 })).toBeNull();
  });
});
