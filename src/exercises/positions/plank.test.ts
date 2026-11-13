import { assert, describe, expect, it } from 'vite-plus/test';
import { Joint } from 'reprepgo-pose/joints';

import { plank as pose } from '@/exercises/__fixtures__/plank';
import type { Vec } from '@/exercises/body/geometry';
import { measurePlank, plankPosition } from './plank';

describe('measurePlank', () => {
  it('reads the hips above the wrists along gravity, and a straight body and leg in the picture', () => {
    // Fixture: shoulders 0.58 m up, hips halfway to the ankles, knees halfway again; forearm 0.28 m.
    const sample = measurePlank(pose({}));
    assert(sample);
    expect(sample.hip).toBeCloseTo(0.29 / 0.28, 1);
    expect(sample.knee).toBeCloseTo(0);
    expect(sample.drop).toBeCloseTo(0);
    expect(sample.rise).toBeCloseTo(22.6, 0);
    expect(sample.reach).toBeGreaterThanOrEqual(50);
    expect(sample.reach).toBeLessThanOrEqual(120);
  });

  it('reads a sag as the hip below the body line, and a pike above it', () => {
    // In the picture, as a share of the shoulder–ankle line: a 40° bend puts the hip 0.18 off it.
    expect(measurePlank(pose({ sag: 40 }))?.drop).toBeCloseTo(0.18, 2);
    const piked = pose({});
    for (const hip of [Joint.LEFT_HIP, Joint.RIGHT_HIP]) piked.landmarks[hip].y -= 0.12;
    expect(measurePlank(piked)?.drop).toBeLessThan(-0.15);
  });

  it('reads nothing when the body is turned far from side-on', () => {
    // Turned 60° to the lens: the picture's line shortens to half and a bend reads twice as big.
    const turned = pose({});
    for (const p of turned.worldLandmarks) [p.x, p.z] = [p.x * 0.5, p.z + p.x * 0.87];
    for (const p of turned.landmarks) p.x = 0.2 + (p.x - 0.2) * 0.5;
    expect(measurePlank(turned)).toBeNull();
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
    body.landmarks[Joint.RIGHT_KNEE].y = 0.8; // the floor in the fixture's picture
    expect(measurePlank(body)?.knee).toBeCloseTo(0);
    body.landmarks[Joint.RIGHT_KNEE].visibility = 0.7;
    expect(measurePlank(body)?.knee).toBeGreaterThan(0.13);
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
    expect(plankPosition.setup({ ...lying, hip: 0.2, drop: 0.05 })).toBe('Get into a plank');
    expect(plankPosition.setup({ ...lying, hip: 0.2, drop: 0.2 })).toBeNull();
  });
});
