import { useState } from 'react';

import { useToday } from '@/components/today';
import { DayLog } from '@/challenges/components/day-log';
import { SurpriseButton } from '@/challenges/components/surprise-button';
import { useSurprise } from '@/challenges/components/surprise-sheet';
import { useLibrary } from '@/challenges/library-live';
import { dayLog } from '@/challenges/library-view';
import { Screen } from '@/components/screen';
import { StreakPanel } from '@/streak/components/streak-panel';
import { dayWords, emptyDayWords, weeks } from '@/streak/components/streak-grid';
import { useStreak } from '@/streak/streak-live';
import { useVideos } from '@/challenges/videos-live';
import type { Day } from '@/lib/day';

/**
 * Home: your streak, the grid to pick a day on and what you did that day, and a random set any time (the
 * die in the top row); the first time it also says how it works.
 */
export default function HomeScreen() {
  const library = useLibrary();
  const today = useToday();
  const streak = useStreak();
  const first = weeks(today)[0][0];
  const videos = useVideos();
  const surprise = useSurprise();
  // Null is today, so the list moves on at midnight; a day you picked stays until it leaves the grid (or
  // the phone's date moves back past it).
  const [picked, setPicked] = useState<Day | null>(null);
  const shown = picked !== null && picked >= first && picked <= today ? picked : today;
  const kind = streak.kind(shown);
  const rows = dayLog(library, shown, today);
  const random = () => {
    // Back from the set, the list shows today, where it landed.
    setPicked(null);
    surprise.pick();
  };
  return (
    <Screen
      label="REPREPGO"
      title="Home"
      intro={
        !streak.trained
          ? "Do any set, and that day's square turns amber. Days in a row are your streak."
          : undefined
      }
      // A random set is always a tap away, the first time too.
      action={<SurpriseButton onPress={random} edge />}
    >
      <StreakPanel
        streak={streak}
        today={today}
        picked={shown}
        onPick={(day) => setPicked(day === today ? null : day)}
      />
      <DayLog
        // Picking a day closes its player; videos stay with this mounted screen.
        key={`${shown}:${rows.map(({ workoutId }) => workoutId).join()}`}
        label={dayWords(shown, kind, today)}
        rows={rows}
        videos={videos}
        empty={emptyDayWords(shown, kind, today)}
      />
      {surprise.sheet}
    </Screen>
  );
}
