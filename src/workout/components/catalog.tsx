import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { StepLines } from './exercise-stack';
import { Glyph } from '@/components/glyph';
import { colors } from '@/theme';
import type { CatalogEntry } from '@/workout/catalog';

/** An experiment: a lab flask with its liquid line. */
const FLASK =
  'M9 3h6M10 3v6l-5.2 9.4A1.8 1.8 0 0 0 6.4 21h11.2a1.8 1.8 0 0 0 1.6-2.6L14 9V3M7 15h10';

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
      accessibilityLabel={`${entry.name}, ${entry.days} days${entry.experimental ? ', experimental counting' : ''}: ${steps}${entry.note ? `. ${entry.note}` : ''}`}
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
