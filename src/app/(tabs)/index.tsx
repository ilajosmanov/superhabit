import { useState } from 'react';

import { useToday } from '@/bootstrap/today';
import { DayLog } from '@/challenges/components/day-log';
import { SurpriseButton, useSurprise } from '@/challenges/components/surprise-sheet';
import { useLibrary } from '@/challenges/library-live';
import { dayLog } from '@/challenges/library-view';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { StreakPanel } from '@/streak/components/streak-panel';
import { dayWords, weeks } from '@/streak/streak';
import { useStreak } from '@/streak/streak-live';
import type { Day } from '@/workout/plan/day';

/**
 * Home: your streak, the grid to pick a day on and what you did that day, and a random set any time (the
 * die in the top row); the first time it says how it works and offers the first set as its button.
 */
export default function HomeScreen() {
  const today = useToday();
  const library = useLibrary();
  const streak = useStreak(today);
  const surprise = useSurprise();
  // Null is today, so the list moves on at midnight; a day you picked stays until it leaves the grid.
  const [picked, setPicked] = useState<Day | null>(null);
  const shown = picked !== null && picked >= weeks(today)[0][0] ? picked : today;
  const kind = streak.kind(shown);
  const rows = dayLog(library, shown, today);
  const fresh = !streak.trained;
  // Any saved workout has a row, even one whose sets counted nothing (so it isn't in the streak).
  const saved = library.workouts.some(({ status }) => status === 'done');
  const random = () => {
    // Back from the set, the list shows today, where it landed.
    setPicked(null);
    surprise.pick();
  };
  return (
    <Screen
      label="SUPERHABIT"
      title="Home"
      intro={
        fresh
          ? "Do any set, and that day's square turns amber. Days in a row are your streak."
          : undefined
      }
      // A random set is always a tap away; the first time, the page is empty and it is the one thing to
      // do, so it is the page's button.
      action={
        !fresh && (
          <SurpriseButton
            onPress={random}
            // The 48dp target overhangs the row; the symbol lines up with the hairline's end.
            style={{ marginRight: -12 }}
          />
        )
      }
      footer={fresh && <PrimaryButton label="Do your first set" onPress={random} />}
    >
      <StreakPanel
        streak={streak}
        today={today}
        picked={shown}
        onPick={(day) => setPicked(day === today ? null : day)}
      />
      {saved && (
        <DayLog
          // A new day starts with nothing playing.
          key={shown}
          day={shown}
          label={dayWords(shown, kind, today)}
          rows={rows}
          empty={
            shown === today
              ? 'Nothing yet today.'
              : kind === 'frozen'
                ? 'No sets. A freeze kept your streak going.'
                : 'No sets on this day.'
          }
        />
      )}
      {surprise.sheet}
    </Screen>
  );
}
