// The 1€ filter (Casiez et al., https://gery.casiez.net/1euro/) with its state as plain data,
// so a counter step is pure: the same state and sample always give the same result.

/** Last filtered value and derivative, the sample rate they imply, and the last timestamp in seconds. */
export type Smooth = { x: number; dx: number; hz: number; t: number };

// Tuned on joint angles in degrees at detector speed (~15–30 Hz; 15 until timestamps give the
// real rate). 1 Hz min cutoff + small beta (speeds reach ~200°/s): a one-frame spike is cut to
// under half, while a real 1 s rep loses only a few degrees of depth.
const HZ = 15;
const MIN_CUTOFF = 1;
const BETA = 0.01;
const D_CUTOFF = 1;

// Same operation order as the reference implementation, so results match it to the bit.
const alpha = (hz: number, cutoff: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff) / (1 / hz));
const lowPass = (prev: number, value: number, a: number) => a * value + (1 - a) * prev;

/** 1€ tuning: the cutoff (Hz) at rest, and how fast it opens with the signal's speed (per unit/s). */
export type Tuning = { minCutoff: number; beta: number };

/**
 * Filters `value`; `prev` undefined starts a new signal. A `tSec` not after the last keeps the last rate.
 * The tuning defaults to the angle tuning above.
 */
export function smooth(
  prev: Smooth | undefined,
  value: number,
  tSec: number,
  { minCutoff, beta }: Tuning = { minCutoff: MIN_CUTOFF, beta: BETA },
): Smooth {
  if (!prev) return { x: value, dx: 0, hz: HZ, t: tSec };
  const hz = tSec > prev.t ? 1 / (tSec - prev.t) : prev.hz;
  const dx = lowPass(prev.dx, (value - prev.x) * hz, alpha(hz, D_CUTOFF));
  const x = lowPass(prev.x, value, alpha(hz, minCutoff + beta * Math.abs(dx)));
  return { x, dx, hz, t: tSec };
}
