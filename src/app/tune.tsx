import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { TuneNumbers } from '@/challenges/components/tune-numbers';
import { create, join } from '@/challenges/library';
import { useLibrary } from '@/challenges/library-live';
import { challengePage } from '@/challenges/library-view';
import { saveFailed } from '@/components/save-failed';
import { useToday } from '@/bootstrap/today';

/**
 * `?id=…`, a suggested challenge you aren't in: change its numbers, then join. Ours as they are joins
 * ours; any change makes it a challenge of your own (like the builder's), joined from today.
 */
export default function TuneScreen() {
  const { id = '' } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const library = useLibrary();
  const day = useToday();
  // Joined once: the screen still takes taps while it slides away, and a second would join again. State,
  // not a ref: render reads it too. A tap is a discrete event, so React applies it before the next tap.
  const [joined, setJoined] = useState(false);
  const page = challengePage(library, id, day);
  // A stale link, or one you're already in (not the run this screen just started while it slides away).
  if (!page?.suggested || !page.challenge || (page.joined && !joined)) {
    return <Redirect href="/" />;
  }

  return (
    <TuneNumbers
      challenge={page.challenge}
      onJoin={(yours) => {
        if (joined) return;
        // Ours as it is: the new run on its page (the page below may name a run that's over). Changed: yours.
        const run = yours ? null : join(id);
        const made = yours ? create(yours) : null;
        if (!run && !made) return saveFailed();
        setJoined(true);
        // The page replaces this screen and the one under it; back from it goes to the tabs.
        router.dismissAll();
        router.push({
          pathname: '/challenge/[id]',
          params: made ? { id: made } : { id, run: run ?? undefined },
        });
      }}
    />
  );
}
