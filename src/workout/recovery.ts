import { fromPromise, setup } from 'xstate';

import { discardWorkout, saveOpenWorkout } from './store';

const save = fromPromise<void, string>(async ({ input }) => saveOpenWorkout(input));
const discard = fromPromise<void, string>(async ({ input }) => discardWorkout(input));

/**
 * A workout left open, offered back: Save keeps it, Discard throws it away. If Save fails, Discard is
 * offered (or Save again); if Discard fails, both are offered again. Done once either went through.
 */
// Positional generics (no type assertions allowed): context, events, actors, children, actions, guards,
// delays, tags, input.
export const recovery = setup<
  { id: string },
  { type: 'save' } | { type: 'discard' },
  { save: typeof save; discard: typeof discard },
  {},
  {},
  {},
  never,
  string,
  { id: string }
>({ actors: { save, discard } }).createMachine({
  context: ({ input }) => input,
  initial: 'asking',
  states: {
    asking: { on: { save: 'saving', discard: 'discarding' } },
    saving: {
      invoke: {
        src: 'save',
        input: ({ context }) => context.id,
        onDone: 'done',
        onError: 'saveFailed',
      },
    },
    saveFailed: { on: { save: 'saving', discard: 'discarding' } },
    discarding: {
      invoke: {
        src: 'discard',
        input: ({ context }) => context.id,
        onDone: 'done',
        onError: 'discardFailed',
      },
    },
    discardFailed: { on: { save: 'saving', discard: 'discarding' } },
    done: { type: 'final' },
  },
});
