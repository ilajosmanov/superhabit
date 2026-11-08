import type { Joints } from '@/exercises/body/geometry';
import type { Detector, Progress } from '@/exercises/kinds/progress';

export { fmtMs, type Gauge } from '@/exercises/kinds/progress';

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

/** What any sample carries besides its numbers: the joints of the angle it draws. */
export type Measured = { joints: Joints };

export type Labels = {
  /** Plural, lower case, for speech and labels: 'squats'. */
  name: string;
  placement: Placement;
  /** How to place the phone, as a heading and a spoken sentence. */
  place: string;
  steps: readonly string[];
  /** When counting starts (the counter waits for the start position). */
  hint: string;
  /** One rep after `ready`, in steps, as the how-to card lists them; thresholds come from the counter. */
  how: readonly string[];
};

export type Exercise<S extends Progress, M extends Measured> = Detector<S, M> & Labels;

/** An exercise: a kind filled in with its position and measure, plus its labels. */
export const exercise = <S extends Progress, M extends Measured>(
  detector: Detector<S, M>,
  labels: Labels,
): Exercise<S, M> => ({ ...detector, ...labels });
