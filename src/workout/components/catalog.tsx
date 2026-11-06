import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { StepLines } from './exercise-stack';
import { FLASK, Glyph } from '@/components/glyph';
import { colors } from '@/theme';
import type { CatalogEntry } from '@/workout/catalog';

/**
 * Outlined, never filled: a filled card means you joined it. Left, every step with its goal in its own
 * unit, so you know what you'd sign up for; right, the length in days, the one number every mix shares.
 */
function ChallengeCard({ entry }: { entry: CatalogEntry }) {
  const body = (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${entry.name}, ${entry.days} days${entry.experimental ? ', experimental counting' : ''}`}
      android_ripple={{ color: colors.surface }}
      className="flex-row items-end gap-4 px-5 py-4.5"
    >
      <View className="flex-1 gap-3.5">
        <View className="flex-row items-center gap-2">
          <Text className="font-sans text-lg tracking-tight text-chalk">{entry.name}</Text>
          {/* Counting still being tuned on real people; the run works, the numbers may be off. */}
          {entry.experimental && <Glyph d={FLASK} size={16} color={colors.muted} />}
        </View>
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
export function Catalog({ label, entries }: { label: string; entries: readonly CatalogEntry[] }) {
  return (
    <View className="gap-3">
      <Text className="font-mono text-xs tracking-widest text-muted">{label}</Text>
      <View className="gap-2.5">
        {entries.map((entry) => (
          <ChallengeCard key={entry.id} entry={entry} />
        ))}
      </View>
    </View>
  );
}
