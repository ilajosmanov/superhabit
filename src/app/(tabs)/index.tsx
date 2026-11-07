import { Catalog } from '@/challenges/components/catalog';
import { Screen } from '@/components/screen';
import { CATALOG } from '@/challenges/catalog';

/** Every challenge as an equal tile. Joined challenges come with storage. */
export default function ChallengesScreen() {
  return (
    <Screen label="SUPERHABIT" title="Challenges">
      <Catalog entries={CATALOG} />
    </Screen>
  );
}
