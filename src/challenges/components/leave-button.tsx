import { useRouter } from 'expo-router';
import { useState } from 'react';

import { leave } from '@/challenges/library';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { IconButton } from '@/components/icon-button';
import { saveFailed } from '@/components/save-failed';
import { colors } from '@/theme';

/**
 * Leaves the run `runId` today. It can't be undone (joining again starts from day 1), so it asks first,
 * in the platform's dialog.
 */
export function LeaveButton({ runId }: { runId: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const onLeave = () => {
    // To the tabs, where the challenge drops out of yours. A failed write says so there, where it still shows.
    router.dismissAll();
    if (!leave(runId)) saveFailed();
  };
  return (
    <>
      {/* A disc as tall as the button beside it, red like the dialog's Leave. */}
      <IconButton
        icon="delete"
        label="Leave challenge"
        color={colors.warn}
        fill={colors.line}
        diameter={60}
        onPress={() => setAsking(true)}
      />
      {asking && (
        <ConfirmDialog
          title="Leave this challenge?"
          text="Joining again starts from day 1. The days you did stay."
          action="Leave"
          onConfirm={onLeave}
          onCancel={() => setAsking(false)}
        />
      )}
    </>
  );
}
