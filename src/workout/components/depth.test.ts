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

  it('reads a 0..1 signal (jumping jack)', () => {
    const jack = { down: 0.7, up: 0.1 };
    expect(depthAt(0.1, jack)).toBe(0);
    expect(depthAt(0.7, jack)).toBeCloseTo(0.8);
  });
});

describe('depthText', () => {
  it('gives angles a degree sign and a 0..1 signal one decimal', () => {
    expect(depthText(99.6, { down: 100 })).toBe('100°');
    expect(depthText(0.66, { down: 0.7 })).toBe('0.7');
  });
});
