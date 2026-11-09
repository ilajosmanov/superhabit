import { useActorRef, useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { recovery } from '@/workout/recovery';

const KEEP_ASKING = () => {};

/** Save or Discard for a workout left open; it can't be dismissed, and nothing shows while it writes. */
export function RecoverPrompt({ recovery: actor }: { recovery: ActorRefFrom<typeof recovery> }) {
  const state = useSelector(actor, (s) => s.value);
  const save = () => actor.send({ type: 'save' });
  const discard = () => actor.send({ type: 'discard' });
  if (state === 'saveFailed') {
    return (
      <ConfirmDialog
        title="Couldn't save it"
        text="The phone may be out of space. Discard the workout, or try saving again."
        action="Discard"
        cancel="Try again"
        onConfirm={discard}
        onCancel={save}
        onDismiss={KEEP_ASKING}
      />
    );
  }
  if (state !== 'asking' && state !== 'discardFailed') return null;
  return (
    <ConfirmDialog
      title="Save your last workout?"
      text={
        state === 'discardFailed'
          ? "Couldn't discard it. The phone may be out of space. Save it, or try again."
          : 'It was left before Done. Save the sets you did, or discard them.'
      }
      action="Save"
      warn={false}
      cancel="Discard"
      onConfirm={save}
      onCancel={discard}
      onDismiss={KEEP_ASKING}
    />
  );
}

/** The prompt for `workoutId`, on its own: before a new workout starts while another is still open. */
export function RecoverOpenWorkout({ workoutId }: { workoutId: string }) {
  const actor = useActorRef(recovery, { input: { id: workoutId } });
  return <RecoverPrompt recovery={actor} />;
}
