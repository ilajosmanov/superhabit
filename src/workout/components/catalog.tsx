import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { StepLines } from './exercise-stack';
import { colors } from '@/theme';
import type { CatalogEntry } from '@/workout/catalog';

/**
 * Outlined, never filled: a filled card means you joined it. Left, every step with its goal in its own
 * unit, so you know what you'd sign up for; right, the length in days, the one number every mix shares.
 */
function ChallengeCard({ entry }: { entry: CatalogEntry }) {
  // The label replaces the card's children for screen readers, so it carries the steps too.
  const steps = entry.steps.map((s) => `${s.name} ${s.goal}`).join(', ');
  const body = (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${entry.name}, ${entry.days} days: ${steps}${entry.note ? `. ${entry.note}` : ''}`}
      android_ripple={{ color: colors.surface }}
      className="flex-row items-end gap-4 px-5 py-4.5"
    >
      <View className="flex-1 gap-3.5">
        <Text className="font-sans text-lg tracking-tight text-chalk">{entry.name}</Text>
        <StepLines entry={entry} />
      </View>
      <View className="items-end gap-1">
        <Text className="font-sans text-6xl font-extralight leading-none tracking-tighter text-chalk">
          {entry.days}
        </Text>
        <Text className="font-mono text-xs tracking-widest text-muted">DAYS</Text>
      </View>
    </Pressable>
  );

  return (
    <View className="overflow-hidden rounded-2xl border border-line">
      <Link href={{ pathname: '/challenge/[id]', params: { id: entry.id } }} asChild>
        {body}
      </Link>
    </View>
  );
}

/** Challenges you haven't joined, one card each. */
export function Catalog({ entries }: { entries: readonly CatalogEntry[] }) {
  return (
    <View className="gap-3">
      <Text className="font-mono text-xs tracking-widest text-muted">OR PICK A CHALLENGE</Text>
      <View className="gap-2.5">
        {entries.map((entry) => (
          <ChallengeCard key={entry.id} entry={entry} />
        ))}
      </View>
    </View>
  );
}
