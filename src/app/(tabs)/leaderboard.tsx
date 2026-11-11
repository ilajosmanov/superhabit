import { useNavigation } from 'expo-router';

import { useLeave } from '@/bootstrap/leave';
import { LeagueScreen } from '@/leaderboard/components/league-screen';

/** League: refreshed each time the tab gains focus, and on return to the app while it is in front. */
export default function LeaderboardRoute() {
  const navigation = useNavigation();
  const { sessionEnded } = useLeave();
  return (
    <LeagueScreen
      tab={(event, listener) => navigation.addListener(event, listener)}
      onSignIn={sessionEnded}
    />
  );
}
