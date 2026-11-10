import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { fromPromise, setup } from 'xstate';

import { discardWorkout, openWorkout, saveOpenWorkout } from './store';

/**
 * A workout an earlier session left open, kept current (Save or Discard clears it); `own`, the workout
 * about to start here, never counts. A new workout can't start while one is left: only one is open.
 */
export function useLeftWorkout(own: string) {
  const { data, updatedAt } = useLiveQuery(openWorkout());
  return { loading: !updatedAt, workout: data && data.id !== own ? data : null };
}

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
