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

const PLUS = 'M12 5v14M5 12h14';

/** Our challenges, joined as-is, one row each, and the way to make your own. */
export function Catalog({ entries }: { entries: readonly CatalogEntry[] }) {
  return (
    <View className="gap-1">
      <View className="h-11 flex-row items-center justify-between">
        <Text className="font-mono text-xs tracking-widest text-muted">SUGGESTED</Text>
        <Link href="/create" asChild>
          <Pressable
            accessibilityRole="link"
            className="-mr-1 h-11 flex-row items-center gap-1.5 px-1"
          >
            <Glyph d={PLUS} size={16} />
            <Text className="font-sans text-base text-chalk">Create a challenge</Text>
          </Pressable>
        </Link>
      </View>
      <View className="gap-2.5">
        {entries.map((entry) => (
          <ChallengeCard key={entry.id} entry={entry} />
        ))}
      </View>
    </View>
  );
}
