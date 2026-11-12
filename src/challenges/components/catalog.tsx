import { Link, useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { ExerciseRow } from './exercise-row';
import { Icon } from '@/components/icon';
import { TextButton } from '@/components/text-button';
import { useColors } from '@/components/colors';
import type { CatalogEntry } from '@/challenges/catalog';
import { SUGGESTED_CHALLENGES, SUGGESTED_GROUPS } from '@/challenges/suggested';

const suggestedIds = new Set(SUGGESTED_CHALLENGES.map(({ id }) => id));

/**
 * A soft fill, no outline or glow: those mean you joined it. The exercise and its daily goal in its own
 * unit (a circuit: its exercises and rounds), and the length in days.
 */
function ChallengeCard({ entry }: { entry: CatalogEntry }) {
  const single = entry.steps.length === 1 ? entry.steps[0] : null;
  const frequency = entry.days === 1 ? 'in one go' : entry.schedule ? 'on training days' : 'a day';
  const line = single
    ? `${single.goal.toUpperCase()} ${frequency.toUpperCase()}`
    : (entry.schedule ?? entry.note ?? `${entry.steps.length} STEPS`);
  const what = single
    ? `${single.name} ${single.goal} ${frequency}`
    : entry.steps.map((step) => step.name).join(', ');
  return (
    <Link href={{ pathname: '/challenge/[id]', params: { id: entry.id } }} asChild>
      <ExerciseRow
        accessibilityRole="link"
        accessibilityLabel={`${entry.name}: ${what}, ${entry.days} ${entry.days === 1 ? 'day' : 'days'}${entry.schedule ? `, ${entry.schedule}` : ''}`}
        name={entry.name}
        line={line}
        steps={entry.steps}
        amount={entry.workload?.amount ?? entry.days}
        unit={entry.workload?.unit ?? (entry.days === 1 ? 'DAY' : 'DAYS')}
      />
    </Link>
  );
}

/** Bar work we don't count yet: a dashed card, not a link. */
function ComingSoon() {
  const colors = useColors();
  return (
    <View
      accessible
      accessibilityLabel="Pull-ups and dips: coming soon, needs a bar"
      className="flex-row items-center gap-4 rounded-2xl border border-dashed border-line py-4 pl-4 pr-5"
    >
      <View className="size-11 items-center justify-center rounded-xl border border-line">
        <Icon name="schedule" size={24} color={colors.muted} />
      </View>
      <View className="flex-1 gap-1">
        <Text className="font-sans text-lg tracking-tight text-muted">Pull-ups and dips</Text>
        <Text className="font-mono text-xs tracking-wide text-muted">
          COMING SOON · NEEDS A BAR
        </Text>
      </View>
    </View>
  );
}

/** Our challenges, then yours you aren't running, one row each, and the way to make your own. */
export function Catalog({ entries }: { entries: readonly CatalogEntry[] }) {
  const router = useRouter();
  const suggested = entries.filter(({ id }) => suggestedIds.has(id));
  const yours = entries.filter(({ id }) => !suggestedIds.has(id));
  return (
    <View className="gap-1">
      <View className="h-12 flex-row items-center justify-between">
        <Text className="font-mono text-xs tracking-widest text-muted">SUGGESTED</Text>
        <TextButton
          icon="add"
          label="Create a challenge"
          onPress={() => router.push('/create')}
          edge
        />
      </View>
      {SUGGESTED_GROUPS.map((group) => {
        const grouped = suggested.filter((entry) =>
          SUGGESTED_CHALLENGES.some((item) => item.id === entry.id && item.group === group),
        );
        return grouped.length > 0 ? (
          <View key={group} className="mb-4 gap-2.5">
            <Text className="py-2 font-mono text-xs tracking-widest text-muted">
              {group.toUpperCase()}
            </Text>
            {grouped.map((entry) => (
              <ChallengeCard key={entry.id} entry={entry} />
            ))}
          </View>
        ) : null;
      })}
      <ComingSoon />
      {yours.length > 0 && (
        <>
          <View className="mt-4 h-12 justify-center">
            <Text className="font-mono text-xs tracking-widest text-muted">MADE BY YOU</Text>
          </View>
          <View className="gap-2.5">
            {yours.map((entry) => (
              <ChallengeCard key={entry.id} entry={entry} />
            ))}
          </View>
        </>
      )}
    </View>
  );
}
