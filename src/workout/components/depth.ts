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

/** The gauge always measures angles in degrees. */
export function depthText(value: number) {
  'worklet';
  return `${Math.round(value)}°`;
}
