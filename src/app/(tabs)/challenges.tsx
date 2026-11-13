import { catalog } from '@/challenges/library-view';
import { useLibrary, useYourRuns } from '@/challenges/library-live';
import {
  Catalog,
  CatalogFilters,
  FILTERS_STYLE,
  useCatalogFilter,
} from '@/challenges/components/catalog';
import { YourChallenges } from '@/challenges/components/your-challenges';
import { Screen } from '@/components/screen';

// shortcut: a run drops off both rows once it is over (it stays in the database); list finished runs
// when there is a history screen.
/** Your runs and the surprise card in one row, then the catalog under its pinned filter chips. */
export default function ChallengesScreen() {
  const library = useLibrary();
  const running = useYourRuns();
  const filter = useCatalogFilter(catalog(library, running));
  return (
    <Screen label="REPREPGO" title="Challenges" pin={1} scroll={filter.scroll}>
      <YourChallenges joined={running} />
      <CatalogFilters filter={filter} style={FILTERS_STYLE} />
      <Catalog filter={filter} />
    </Screen>
  );
}
