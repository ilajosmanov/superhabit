/**
 * Where one rep's loop is at `ms`, 0 to 1: out to the other pose, a beat there, back, a beat home,
 * eased in and out. Runs on the UI thread.
 */
export function repAt(ms: number, period: number) {
  'worklet';
  const x = (ms % period) / period;
  const ease = (u: number) => (u < 0.5 ? 2 * u * u : 1 - (2 - 2 * u) ** 2 / 2);
  if (x < 0.4) return ease(x / 0.4);
  if (x < 0.5) return 1;
  if (x < 0.9) return 1 - ease((x - 0.5) / 0.4);
  return 0;
}
