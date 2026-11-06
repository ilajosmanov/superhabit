import { CameraTestCard } from '@/workout/components/camera-test-card';
import { Catalog } from '@/workout/components/catalog';
import { Screen } from '@/components/screen';
import { CATALOG } from '@/workout/catalog';

/** The camera test leads, then every challenge as an equal tile. Joined challenges come with storage. */
export default function ChallengesScreen() {
  return (
    <Screen label="SUPERHABIT" title="Challenges">
      <CameraTestCard />
      <Catalog label="OR PICK A CHALLENGE" entries={CATALOG} />
    </Screen>
  );
}
