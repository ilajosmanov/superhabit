import { useState } from 'react';

import { sessionChallenge, type Library } from './library-view';
import { today } from '@/lib/day';

/**
 * What a workout on `id` (a run, or an exercise for one go) runs, decided once as it starts: later
 * changes (midnight on a run's last day, an edit to the challenge) never swap the plan under a running
 * session or close it. `run` stays live for the Done page, on the session's own day and version, with
 * workout `workoutId` counted in as if it were Done: a set finished at 00:05 still belongs to yesterday.
 */
export function useSessionStart(library: Library, id: string, workoutId: string) {
  const [start] = useState(() => new Date());
  const [{ challenge, target }] = useState(() => sessionChallenge(library, id, today(start)));
  const { run } = sessionChallenge(library, id, today(start), {
    workoutId,
    versionId: target.versionId,
  });
  return { start, challenge, target, run };
}
