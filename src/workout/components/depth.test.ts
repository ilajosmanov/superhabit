import { describe, expect, it } from 'vite-plus/test';

import { depthAt, depthText } from './depth';

describe('depthAt', () => {
  it('falls with a squat: up at the top, down at 80 %, 25 % past down at the bottom', () => {
    const squat = { down: 100, up: 160 };
    expect(depthAt(160, squat)).toBe(0);
    expect(depthAt(100, squat)).toBeCloseTo(0.8);
    expect(depthAt(85, squat)).toBe(1);
    expect(depthAt(180, squat)).toBe(0);
  });

  it('rises with a glute bridge: lying flat is the top', () => {
    const bridge = { down: 160, up: 140 };
    expect(depthAt(140, bridge)).toBe(0);
    expect(depthAt(160, bridge)).toBeCloseTo(0.8);
    expect(depthAt(120, bridge)).toBe(0);
  });
});

describe('depthText', () => {
  it('rounds angles and adds a degree sign', () => {
    expect(depthText(99.6)).toBe('100°');
  });
});
