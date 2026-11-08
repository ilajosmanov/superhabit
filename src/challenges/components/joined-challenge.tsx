import { useState } from 'react';
import { Text, View } from 'react-native';

import { DayStrip } from './day-strip';
import { HowItCounts } from './how-it-counts';
import { SessionPlan } from './session-plan';
import { WatchDay } from './watch-day';
import { detail, plan } from '@/challenges/challenges';
import { addDays, doneToday, percent, type Run } from '@/challenges/days';
import type { Saved } from '@/challenges/saved';
import { setShare } from '@/workout/results';

/**
 * A challenge you are in: how today stands, every day of the run to pick from, what the picked day asks
 * for and what each of its sets got, and how each exercise counts.
 */
export function JoinedChallenge({ saved, run }: { saved: Saved; run: Run }) {
  const { challenge } = saved;
  const today = run.day - 1;
  // Today until you pick another day.
  const [picked, setPicked] = useState<number | null>(null);
  const selected = picked ?? today;
  const session = plan(challenge);
  const { sets } = detail(challenge);

  const share = run.progress[selected] ?? 0;
  const kept = saved.sets[addDays(run.from, selected)];
  // A day with no try got nothing from any set. One tried before sets were kept, or before an edit
  // changed them, has only its share: the strip shows it and the rows show the plan alone.
  const done = share === 0 ? sets.map(() => 0) : kept?.length === sets.length ? kept : undefined;
  const next =
    selected === today && done ? done.findIndex((n, i) => setShare(sets[i].goal, n) < 1) : -1;

  const todayShare = run.progress[today];
  const status = doneToday(run)
    ? 'DONE TODAY'
    : todayShare > 0
      ? `TODAY ${percent(todayShare)}`
      : 'DUE TODAY';
  return (
    <>
      <View className="-mt-5 flex-row items-center gap-2">
        {!doneToday(run) && <View className="size-1.5 rounded-full bg-accent" />}
        <Text className="font-mono text-xs tracking-widest text-muted">
          {`DAY ${run.day} OF ${run.days} · ${status}`}
        </Text>
      </View>

      <DayStrip run={run} selected={selected} onSelect={setPicked} />

      <SessionPlan plan={session} days={challenge.days} day={done && { done, next }} />

      {done && (
        <WatchDay
          label={selected === today ? 'WATCH TODAY' : `WATCH DAY ${selected + 1}`}
          sets={sets}
          done={done}
        />
      )}

      <HowItCounts exercises={session.exercises} />
    </>
  );
}
