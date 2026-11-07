import { Screen } from '@/components/screen';
import { LeaderboardPreview } from '@/friends/leaderboard-preview';

export default function FriendsScreen() {
  return (
    <Screen
      label="FRIENDS"
      title="Leaderboard"
      intro="Rank against friends on clean reps only. The camera keeps everyone honest."
    >
      <LeaderboardPreview />
    </Screen>
  );
}
