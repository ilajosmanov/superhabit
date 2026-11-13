import { catalog } from '@/challenges/library-view';
import { useLibrary, useYourRuns } from '@/challenges/library-live';
import { Catalog } from '@/challenges/components/catalog';
import { YourChallenges } from '@/challenges/components/your-challenges';
import { Screen } from '@/components/screen';

// shortcut: a run drops off both rows once it is over (it stays in the database); list finished runs
// when there is a history screen.
/** Your runs and the surprise card in one row, then ours you aren't running. */
export default function ChallengesScreen() {
  const library = useLibrary();
  const running = useYourRuns();
  return (
    <Screen label="SUPERHABIT" title="Challenges">
      <YourChallenges joined={running} />
      <Catalog entries={catalog(library, running)} />
    </Screen>
  );
}
