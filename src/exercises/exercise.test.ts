import { describe, expect, it } from 'vite-plus/test';

import { orientation } from './exercise';

describe('orientation', () => {
  it('uses landscape for a phone on its side on the floor', () => {
    expect(orientation('side-floor')).toBe('landscape');
  });

  it('uses portrait for both upright placements', () => {
    expect(orientation('front-upright')).toBe('portrait');
    expect(orientation('side-upright')).toBe('portrait');
  });
});
