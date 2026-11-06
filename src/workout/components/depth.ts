import type { Gauge } from '@/exercises/exercise';

export type { Gauge };

/** How far past "deep enough" the track runs: `down` sits at 80 %, 25 % beyond it fills the rest. */
const OVER = 1.25;

/**
 * 0 (top) … 1 (bottom) on a depth track: `up` (the start position) at the top, `down` at 80 %.
 * Works whichever way the signal moves: squat angles fall, glute-bridge angles rise.
 */
export function depthAt(value: number, gauge: Gauge) {
  'worklet';
  const t = (value - gauge.up) / (gauge.down - gauge.up);
  return Math.min(OVER, Math.max(0, t)) / OVER;
}

/** "100°" for an angle; "0.7" for a unitless signal (jumping jack's 0..1 spread). */
export function depthText(value: number, gauge: { down: number }) {
  'worklet';
  // Every angle gauge's `down` is well past 1°; only 0..1 signals sit at or below it.
  return gauge.down > 1 ? `${Math.round(value)}°` : value.toFixed(1);
}
