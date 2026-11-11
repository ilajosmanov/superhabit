import { assign, fromPromise, setup } from 'xstate';

import { authClient } from './auth-client';
import { setSharing, sharingNow, whyFailed, type ConsentError } from './consent';
import { SERVER_URL } from './server';

const sharing = fromPromise<void, boolean>(({ input }) => setSharing(input));
const deleting = fromPromise(async () => {
  const { error } = await authClient.$fetch(`${SERVER_URL}/account`, { method: 'DELETE' });
  if (error) throw new Error(error.message ?? `delete: ${error.status}`);
});

type Failure = { about: 'sharing' | 'deleting'; why: ConsentError };

/**
 * Profile's account controls, one call at a time (the switch is off while one runs). The switch shows its
 * new place at once; turning sharing on goes back if the server didn't take it (turning it off never
 * fails: `setSharing`). Delete account:
 * once the server has deleted it, `deleted` (provided by the screen) hands over to startup, which clears
 * the phone.
 */
// Positional generics (no type assertions allowed): context, events, actors, children, actions.
export const me = setup<
  { sharing: boolean; error: Failure | null },
  { type: 'share'; on: boolean } | { type: 'delete' },
  { sharing: typeof sharing; deleting: typeof deleting; whyFailed: typeof whyFailed },
  {},
  { deleted: undefined }
>({ actors: { sharing, deleting, whyFailed }, actions: { deleted: () => {} } }).createMachine({
  context: () => ({ sharing: sharingNow(), error: null }),
  initial: 'idle',
  states: {
    idle: {
      on: {
        share: {
          target: 'sharing',
          actions: assign({ sharing: ({ event }) => event.on, error: null }),
        },
        delete: { target: 'deleting', actions: assign({ error: null }) },
      },
    },
    sharing: {
      invoke: {
        src: 'sharing',
        input: ({ context }) => context.sharing,
        onDone: 'idle',
        onError: {
          target: 'failing',
          actions: [
            assign({ sharing: false, error: { about: 'sharing', why: 'failed' } }),
            ({ event }) => console.warn('[consent]', event.error),
          ],
        },
      },
    },
    deleting: {
      invoke: {
        src: 'deleting',
        onDone: { target: 'deleted', actions: 'deleted' },
        onError: {
          target: 'failing',
          actions: [
            assign({ error: { about: 'deleting', why: 'failed' } }),
            ({ event }) => console.warn('[account] delete failed', event.error),
          ],
        },
      },
    },
    // Says why: no internet, or anything else.
    failing: {
      invoke: {
        src: 'whyFailed',
        onDone: {
          target: 'idle',
          actions: assign({
            error: ({ context, event }) =>
              context.error && { about: context.error.about, why: event.output },
          }),
        },
        onError: 'idle',
      },
    },
    deleted: { type: 'final' },
  },
});
