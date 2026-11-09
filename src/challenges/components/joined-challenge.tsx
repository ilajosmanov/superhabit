import { useState } from 'react';
import { Text, View } from 'react-native';

import { DayStrip } from './day-strip';
import { HowItCounts } from './how-it-counts';
import { SessionPlan } from './session-plan';
import { WatchDay } from './watch-day';
import { detail, plan } from '@/challenges/challenges';
import type { Joined } from '@/challenges/library-view';
import { doneToday, percent } from '@/challenges/run-view';
import { setShare } from '@/workout/results';

/**
 * A challenge you are in: how today stands, every day of the run to pick from, what the picked day asks
 * for and what each of its sets got, and how each exercise counts.
 */
export function JoinedChallenge({ joined: { challenge, run, amounts } }: { joined: Joined }) {
  const today = run.day - 1;
  // Today until you pick another day.
  const [picked, setPicked] = useState<number | null>(null);
  const selected = picked ?? today;
  const session = plan(challenge);
  const { sets } = detail(challenge);

  // Unknown for a day ahead or a try under another version: the rows show the plan alone.
  const done = amounts.at(selected);
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
