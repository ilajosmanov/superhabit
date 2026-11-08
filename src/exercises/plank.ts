import { fmtMs, SETUP, type Exercise } from './exercise';
import { hold, type HoldState } from '@/exercises/kinds/hold';
import { plankPosition, type PlankSample } from './positions/plank';

export const plank: Exercise<HoldState, PlankSample> = {
  ...hold(plankPosition),
  name: 'plank',
  // Body flat and low on the forearms, so it doesn't read as the push-up's slanted body on straight arms.
  placement: 'side-floor',
  ...SETUP['side-floor'],
  hint: 'The clock starts once you hold a straight plank.',
  ready: plankPosition.ready,
  parts: ['head', 'hips', 'feet'],
  gauge: null,
  measure: plankPosition.measure,
  stats: ({ heldMs, noReps }) =>
    `HELD ${fmtMs(heldMs)} · ${noReps} ${noReps === 1 ? 'BREAK' : 'BREAKS'}`,
};
