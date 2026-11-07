import { CATALOG } from '@/challenges/catalog';
import { Catalog } from '@/challenges/components/catalog';
import { YourChallenges } from '@/challenges/components/your-challenges';
import { useActive } from '@/challenges/mine';
import { Screen } from '@/components/screen';

// shortcut: a challenge you made drops off both rows once its run is over (it stays in the file); list
// finished runs when there is a history screen.
/** Your challenges and the surprise card in one row, then ours you aren't running. */
export default function ChallengesScreen() {
  const active = useActive();
  return (
    <Screen label="SUPERHABIT" title="Challenges">
      <YourChallenges active={active} />
      <Catalog entries={CATALOG.filter(({ id }) => !active.some((entry) => entry.id === id))} />
    </Screen>
  );
}
