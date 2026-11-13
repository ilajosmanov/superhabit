import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useRef } from 'react';

import { ONE_GO } from '@/challenges/one-go';
import { Builder } from '@/challenges/components/builder';
import { saveFailed } from '@/components/save-failed';
import { draftOf, newDraft } from '@/challenges/draft';
import { create, edit } from '@/challenges/library';
import { useLibrary } from '@/challenges/library-live';
import { challengePage } from '@/challenges/library-view';
import { useToday } from '@/components/today';

/**
 * The builder: `?exercise=squat` makes a new challenge, which you join from today;
 * `?id=…` edits one you made, as a new version your run follows from its next workout.
 */
export default function BuildScreen() {
  const { exercise, id = '' } = useLocalSearchParams<{ exercise?: string; id?: string }>();
  const router = useRouter();
  const library = useLibrary();
  const day = useToday();
  const fresh = ONE_GO.find((one) => one === exercise);
  // Saved once: the screen still takes taps while it slides away, and a second would write again.
  const saved = useRef(false);

  if (fresh) {
    return (
      <Builder
        initial={newDraft(fresh)}
        from={day}
        action="Create challenge"
        onSave={(challenge) => {
          if (saved.current) return;
          const made = create(challenge);
          if (!made) return saveFailed();
          saved.current = true;
          // The picker and builder close; back from the new challenge goes to the tabs.
          router.dismissAll();
          router.push({ pathname: '/challenge/[id]', params: { id: made } });
        }}
      />
    );
  }
  const page = challengePage(library, id, day);
  const draft = page?.editable && page.challenge && draftOf(page.challenge);
  // A stale link, someone else's challenge, or one the builder can't show (several steps).
  if (!page || !draft) return <Redirect href="/" />;
  return (
    <Builder
      initial={draft}
      from={page.joined?.run.from ?? day}
      action="Save"
      onSave={(challenge) => {
        if (saved.current) return;
        if (!edit(id, challenge)) return saveFailed();
        saved.current = true;
        router.back();
      }}
    />
  );
}
