import { useState } from 'react';

import { useToday } from '@/bootstrap/today';
import { DayLog } from '@/challenges/components/day-log';
import { SurpriseButton } from '@/challenges/components/surprise-button';
import { useSurprise } from '@/challenges/components/surprise-sheet';
import { useLibrary } from '@/challenges/library-live';
import { dayLog } from '@/challenges/library-view';
import { Screen } from '@/components/screen';
import { StreakPanel } from '@/streak/components/streak-panel';
import { dayWords, weeks } from '@/streak/streak';
import { useStreak } from '@/streak/streak-live';
import type { Day } from '@/workout/plan/day';

// Today can still change, so an empty today gets nudges, in turn; a day that is over says what happened.
const NUDGES = [
  'The couch is winning today. One set and it loses.',
  'Your muscles are bored. Give them one set.',
  'Zero reps so far. Every legend starts with one.',
];

/**
 * Home: your streak, the grid to pick a day on and what you did that day, and a random set any time (the
 * die in the top row); the first time it also says how it works.
 */
export default function HomeScreen() {
  const today = useToday();
  const library = useLibrary();
  const streak = useStreak(today);
  const surprise = useSurprise();
  // Null is today, so the list moves on at midnight; a day you picked stays until it leaves the grid (or
  // the phone's date moves back past it).
  const [picked, setPicked] = useState<Day | null>(null);
  const shown = picked !== null && picked >= weeks(today)[0][0] && picked <= today ? picked : today;
  const kind = streak.kind(shown);
  const rows = dayLog(library, shown, today);
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
        !streak.trained
          ? "Do any set, and that day's square turns amber. Days in a row are your streak."
          : undefined
      }
      // A random set is always a tap away, the first time too.
      action={
        <SurpriseButton
          onPress={random}
          // The 48dp target overhangs the row; the symbol lines up with the hairline's end.
          style={{ marginRight: -12 }}
        />
      }
    >
      <StreakPanel
        streak={streak}
        today={today}
        picked={shown}
        onPick={(day) => setPicked(day === today ? null : day)}
      />
      <DayLog
        // A new day starts with nothing playing.
        key={shown}
        label={dayWords(shown, kind, today)}
        rows={rows}
        empty={
          shown === today
            ? NUDGES
            : kind === 'frozen'
              ? 'No sets. A freeze kept your streak going.'
              : 'No sets on this day.'
        }
      />
      {surprise.sheet}
    </Screen>
  );
}
