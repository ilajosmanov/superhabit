import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Glyph } from '@/components/glyph';
import { colors } from '@/theme';
import type { CatalogEntry } from '@/challenges/catalog';

/**
 * Outlined, never filled: a filled card means you joined it. The exercise, its daily goal in its own
 * unit, and the length in days.
 */
function ChallengeCard({ entry }: { entry: CatalogEntry }) {
  // Suggested challenges are one exercise each.
  const [step] = entry.steps;
  const body = (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${entry.name}: ${step.name} ${step.goal} a day, ${entry.days} days`}
      android_ripple={{ color: colors.surface }}
      className="flex-row items-center gap-4 py-4 pl-4 pr-5"
    >
      <View className="size-11 items-center justify-center rounded-xl border border-line">
        <Glyph d={step.glyph} size={24} box={32} />
      </View>
      <View className="flex-1 gap-1">
        <Text className="font-sans text-lg tracking-tight text-chalk">{entry.name}</Text>
        <Text className="font-mono text-xs tracking-wide text-muted">
          {step.goal.toUpperCase()} A DAY
        </Text>
      </View>
      <View className="items-end gap-1">
        <Text className="font-sans text-5xl font-extralight leading-none tracking-tighter text-chalk">
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

// shortcut: no "Create a challenge" link beside SUGGESTED yet; add it with the create screen.
/** Our challenges, joined as-is, one row each. */
export function Catalog({ entries }: { entries: readonly CatalogEntry[] }) {
  return (
    <View className="gap-1">
      <View className="h-11 justify-center">
        <Text className="font-mono text-xs tracking-widest text-muted">SUGGESTED</Text>
      </View>
      <View className="gap-2.5">
        {entries.map((entry) => (
          <ChallengeCard key={entry.id} entry={entry} />
        ))}
      </View>
    </View>
  );
}
