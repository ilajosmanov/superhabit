import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { ONE_GO } from '@/challenges/challenges';
import { Builder } from '@/challenges/components/builder';
import { saveFailed } from '@/challenges/components/save-failed';
import { draftOf, newDraft } from '@/challenges/draft';
import { create, update, useChallenge } from '@/challenges/mine';

/**
 * The builder: `?exercise=squat` makes a new challenge, which you join from today;
 * `?id=…` edits one you are in, keeping its run.
 */
export default function BuildScreen() {
  const { exercise, id = '' } = useLocalSearchParams<{ exercise?: string; id?: string }>();
  const router = useRouter();
  const found = useChallenge(id)?.saved;
  // The one being edited, as it was when the screen opened: leaving deletes it while the screen closes.
  const [saved] = useState(found);
  const fresh = ONE_GO.find((one) => one === exercise);

  if (fresh) {
    return (
      <Builder
        initial={newDraft(fresh)}
        action="Create challenge"
        onSave={(challenge) => {
          const made = create(challenge);
          if (!made) return saveFailed();
          // The picker and builder close; back from the new challenge goes to the tabs.
          router.dismissAll();
          router.push({ pathname: '/challenge/[id]', params: { id: made } });
        }}
      />
    );
  }
  const draft = saved && draftOf(saved.challenge);
  // A stale link, or a challenge the builder can't show (several steps).
  if (!saved || !draft) return <Redirect href="/" />;
  return (
    <Builder
      initial={draft}
      history={saved}
      action="Save"
      onSave={(challenge) => (update(saved.id, challenge) ? router.back() : saveFailed())}
    />
  );
}
