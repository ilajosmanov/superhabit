import { useState } from 'react';
import { Text, View } from 'react-native';

import { DayStrip } from './day-strip';
import { HowItCounts } from './how-it-counts';
import { SessionPlan } from './session-plan';
import { WatchDay } from './watch-day';
import { planView, trackedSets } from '@/challenges/plan-view';
import type { Joined } from '@/challenges/library-view';
import { doneToday, restingToday, percent } from '@/challenges/run-view';
import { expand } from '@/workout/plan/plan';
import { useVideos } from '@/challenges/videos-live';
import { setShare } from '@/workout/plan/results';

/**
 * A challenge you are in: how today stands, every day of the run to pick from, what the picked day asks
 * for and what each of its sets got, and how each exercise counts.
 */
export function JoinedChallenge({ joined: { challenge, run, amounts } }: { joined: Joined }) {
  const videos = useVideos();
  const today = run.day - 1;
  // Today until you pick another day.
  const [picked, setPicked] = useState<number | null>(null);
  const selected = picked ?? today;
  // A day ahead shows the plan alone; a day with a try, the version that try was done on.
  const day = amounts.at(selected);
  const shown = day?.version ?? challenge;
  const done = day?.done;
  const session = planView(shown);
  const { sets } = trackedSets(shown);
  const next =
    selected === today && done ? done.findIndex((n, i) => setShare(sets[i].goal, n) < 1) : -1;

  const resting = restingToday(run);
  const selectedRest = run.restDays?.includes(selected) ?? false;
  const todayShare = run.progress[today];
  const status = resting
    ? 'REST DAY'
    : doneToday(run)
      ? 'DONE TODAY'
      : todayShare > 0
        ? `TODAY ${percent(todayShare)}`
        : 'DUE TODAY';
  return (
    <>
      <View className="-mt-5 flex-row items-center gap-2">
        {!resting && !doneToday(run) && <View className="size-1.5 rounded-full bg-accent" />}
        <Text className="font-mono text-xs tracking-widest text-muted">
          {`DAY ${run.day} OF ${run.days} · ${status}`}
        </Text>
      </View>

      <DayStrip run={run} selected={selected} onSelect={setPicked} />

      {selectedRest ? (
        <View className="gap-2 rounded-3xl bg-surface p-6">
          <Text className="font-sans text-3xl font-light text-chalk">Rest day</Text>
          <Text className="font-sans text-base text-soft">
            No workout is due for this challenge. Your next training day continues the plan.
          </Text>
        </View>
      ) : (
        <SessionPlan
          plan={session}
          days={shown.days}
          scheduled={!!shown.schedule}
          day={done && { done, next }}
        />
      )}

      {day && !selectedRest && (
        <WatchDay
          // A different day closes its player; the folder snapshot stays with this screen.
          key={day.sets.map(({ id }) => id).join()}
          // The day shows one try (the latest that met the goal, else the latest); a daily total, all.
          label={`${selected === today ? 'TODAY' : `DAY ${selected + 1}`} · ${shown.dailyTotal ? 'EVERY TRY' : 'THE TRY THAT COUNTS'}`}
          sets={sets}
          done={day.done}
          steps={expand(shown.session)}
          kept={day.sets}
          videos={videos}
        />
      )}

      {!selectedRest && <HowItCounts exercises={session.exercises} />}
    </>
  );
}
