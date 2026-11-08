import type { BodyPart, Joints, Pose } from '@/exercises/body/geometry';
import type { Counter, Progress } from '@/exercises/kinds/progress';

export type Placement = 'front-upright' | 'side-floor' | 'side-upright';
export type Orientation = 'portrait' | 'landscape';
export const orientation = (p: Placement): Orientation =>
  p === 'side-floor' ? 'landscape' : 'portrait';

/** Default phone-setup copy per placement; an exercise may override it. */
export const SETUP: Record<Placement, { place: string; steps: readonly string[] }> = {
  'front-upright': {
    place: 'Stand the phone upright',
    steps: ['Prop it up on its short edge', '2 to 3 m away, facing you', 'Head to feet in frame'],
  },
  'side-upright': {
    place: 'Stand the phone upright',
    steps: [
      'Prop it up on its short edge',
      '2 to 3 m away, side-on to you',
      'Head to feet in frame',
    ],
  },
  'side-floor': {
    place: 'Turn the phone sideways',
    steps: [
      'Lay it on the floor on its long edge',
      'About 2 m away, side-on to you',
      'Head to feet in frame',
    ],
  },
};

/** What any measure reports besides its angles: the joints of the angle it counts on. */
export type Measured = { joints: Joints };

/** A depth gauge: `up` is the start position, `down` deep enough; either may be the larger. */
export type Gauge = { down: number; up: number };

export type Exercise<S extends Progress, M extends Measured> = Counter<S, M> & {
  /** Plural, lower case, for speech and labels: 'squats'. */
  name: string;
  placement: Placement;
  /** How to place the phone, as a heading and a spoken sentence. */
  place: string;
  steps: readonly string[];
  /** When counting starts (the counter waits for the start position). */
  hint: string;
  /** The start position, as a short heading while the counter waits for it. */
  ready: string;
  /** Must be in frame to start; the rest may be cut off. */
  parts: readonly BodyPart[];
  /** Null when there is no depth gauge or rep strip (hold / sequence). */
  gauge: Gauge | null;
  /** One detector result's sample; null unless the needed joints are seen. Pure. */
  measure(pose: Pose): M | null;
  /** Metrics line for the last rep, without cues; null before the first rep. */
  stats(s: S): string | null;
};

/** Duration readout shared by cycle exercises' stats lines. */
export const fmtMs = (ms: number | null) => (ms === null ? '—' : `${(ms / 1000).toFixed(1)}s`);
