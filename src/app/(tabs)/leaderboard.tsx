import { useNavigation } from 'expo-router';

import { useLeave } from '@/bootstrap/leave';
import { useSurprise } from '@/challenges/components/surprise-sheet';
import { LeagueScreen } from '@/leaderboard/components/league-screen';
import { useStreak } from '@/streak/streak-live';

/**
 * League: refreshed each time the tab gains focus, and on return to the app while it is in front. With
 * no points yet, a random set is a tap away, as on Home.
 */
export default function LeaderboardRoute() {
  const navigation = useNavigation();
  const { sessionEnded } = useLeave();
  const streak = useStreak();
  const surprise = useSurprise();
  return (
    <LeagueScreen
      tab={(event, listener) => navigation.addListener(event, listener)}
      onSignIn={sessionEnded}
      // The days in a row your next set makes: today's done already counts in the streak.
      streak={streak.status === 'done' ? streak.current : streak.current + 1}
      onScore={surprise.pick}
    >
      {surprise.sheet}
    </LeagueScreen>
  );
}
