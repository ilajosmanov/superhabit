// A cycle gated by a position: one measure going down and back up while the body stays in the
// position is one rep. The position's setup is judged at the top, where the body is at rest; its
// form on every frame of the rep. The measure gives the number to count.
import type { Joints, Pose, Side } from '@/exercises/body/geometry';
import type { Measure } from '@/exercises/measures/measure';
import type { Position } from '@/exercises/positions/position';
import { cycle, type CycleState } from './cycle';
import type { Counter, Rep } from './progress';

export type PositionCycleConfig<P> = {
  position: Position<P>;
  measure: Measure;
  /** The measure at or past this is the top: where a rep starts and ends. */
  up: number;
  /** Reached this on the way: deep enough to count. */
  down: number;
  /** Moved past this without reaching `down`: a failed rep. */
  shallow: number;
  /** A full rep faster than this is counted, with a cue to slow down. */
  fastMs: number;
};

/** One frame: the position's reading and the measure on the same side. */
export type PositionSample<P> = { at: P; value: number; joints: Joints };

/** The first form cue of the attempt. */
type Attempt = { cue: string | null };

export type PositionReport = Rep & {
  depth: number;
  downMs: number | null;
  upMs: number | null;
};

export type PositionCycleState = CycleState<Attempt, PositionReport>;

export function positionCycle<P extends { side: Side }>(
  c: PositionCycleConfig<P>,
): Counter<PositionCycleState, PositionSample<P>> & {
  measure(pose: Pose): PositionSample<P> | null;
} {
  const { position: p } = c;
  const placed = (m: PositionSample<P>) => p.setup(m.at) === null;
  const good = (m: PositionSample<P>) => placed(m) && p.form(m.at) === null;
  const counter = cycle<PositionSample<P>, Attempt, PositionReport>({
    signal: (m) => m.value,
    up: c.up,
    down: c.down,
    shallow: c.shallow,
    start: good,
    // The bottom counts only with good form; setup is not judged mid-movement.
    turn: (m) => p.form(m.at) === null,
    // A shallow dip is a failed rep only while still in the position.
    tried: (_a, m) => placed(m),
    clean: (a, m) => a.cue === null && placed(m),
    fresh: { cue: null },
    add: (a, m) => (a.cue === null ? { cue: p.form(m.at) } : a),
    report: (a, m, { counted, depth, downMs, upMs }) => {
      const fast = downMs !== null && upMs !== null && downMs + upMs < c.fastMs;
      const cue = !counted && (p.setup(m.at) ?? a.cue ?? 'Go lower');
      const cues = [cue, fast && 'Slow down'].filter((x): x is string => !!x);
      return { counted, cues, depth, downMs, upMs };
    },
  });
  return {
    ...counter,
    measure: (pose) => {
      const at = p.measure(pose);
      const reading = at && c.measure.read(pose, at.side);
      return at && reading ? { at, ...reading } : null;
    },
  };
}
