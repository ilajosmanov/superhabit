import { Catalog } from '@/challenges/components/catalog';
import { YourChallenges } from '@/challenges/components/your-challenges';
import { Screen } from '@/components/screen';
import { CATALOG } from '@/challenges/catalog';

/** Your challenges and the surprise card in one row, then ours. Joined challenges come with storage. */
export default function ChallengesScreen() {
  return (
    <Screen label="SUPERHABIT" title="Challenges">
      <YourChallenges progress={[]} />
      <Catalog entries={CATALOG} />
    </Screen>
  );
}
