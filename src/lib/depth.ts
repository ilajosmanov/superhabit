/** A depth gauge: `up` is the start position, `down` deep enough; either may be the larger. */
export type Gauge = { down: number; up: number };

/** How far past "deep enough" the track runs: `down` sits at 80 %, 25 % beyond it fills the rest. */
const OVER = 1.25;

/**
 * How far a value is from the start position toward deep enough: 0 at `up`, 1 at `down`, more past it.
 * Works whichever way the signal moves: squat angles fall, glute-bridge angles rise.
 */
export function past(value: number, gauge: Gauge) {
  'worklet';
  return (value - gauge.up) / (gauge.down - gauge.up);
}

/** 0 (top) … 1 (bottom) on the live depth track: `up` at the top, `down` at 80 %, deeper all fills it. */
export function depthAt(value: number, gauge: Gauge) {
  'worklet';
  return Math.min(OVER, Math.max(0, past(value, gauge))) / OVER;
}

/** "≤ 100°" (a falling angle: smaller is deeper) or "≥ 18°" (a rising one): where a rep counts. */
export const countsAt = (gauge: Gauge) =>
  `${gauge.down < gauge.up ? '≤' : '≥'} ${depthText(gauge.down)}`;

/** The gauge always measures angles in degrees. */
export function depthText(value: number) {
  'worklet';
  return `${Math.round(value)}°`;
}
