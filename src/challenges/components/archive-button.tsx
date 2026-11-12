import { useRouter } from 'expo-router';
import { useState } from 'react';

import { archive } from '@/challenges/library';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { saveFailed } from '@/components/save-failed';
import { IconButton } from '@/components/icon-button';

/** Confirm that archiving is permanent. */
export function ArchiveButton({ challengeId }: { challengeId: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  return (
    <>
      <IconButton label="Archive challenge" icon="archive" onPress={() => setAsking(true)} edge />
      {asking && (
        <ConfirmDialog
          title="Archive this challenge?"
          text="This can’t be undone. To do it again, you’ll need to create a new challenge."
          action="Archive"
          onConfirm={() => {
            setAsking(false);
            if (!archive(challengeId)) return saveFailed();
            router.dismissAll();
          }}
          onCancel={() => setAsking(false)}
        />
      )}
    </>
  );
}
