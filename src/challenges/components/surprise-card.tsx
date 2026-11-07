import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View, type ViewStyle } from 'react-native';

import { ExerciseStack } from './exercise-stack';
import { SurpriseSheet } from './surprise-sheet';
import { capitalise, ONE_GO } from '@/challenges/challenges';
import { Glyph } from '@/components/glyph';
import { EXERCISES, type ExerciseId } from '@/exercises/registry';
import { colors, lit } from '@/theme';

const EVERY = ONE_GO.map((id) => ({
  glyph: EXERCISES[id].glyph,
  name: capitalise(EXERCISES[id].name),
}));

const ring = (x: number, y: number, r: number) =>
  `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
/** A solid dot on the 32 grid: two rings whose strokes overlap. */
const pip = (x: number, y: number) => ring(x, y, 0.55) + ring(x, y, 0.2);
/** A die seen from its corner, in the exercise glyphs' line: one pip on top, two left, three right. */
const DIE =
  'M16 4 26.4 10v12L16 28 5.6 22V10ZM5.6 10 16 16l10.4-6M16 16v12' +
  [
    [16, 10],
    [8.5, 15],
    [13.1, 23],
    [23.8, 14.5],
    [21.2, 19],
    [18.6, 23.5],
  ]
    .map(([x, y]) => pip(x, y))
    .join('');

/**
 * One random exercise, once, as many as you can; a sheet says which before the camera opens. The last
 * card of the YOURS row, or the whole row when nothing is joined. Outlined, not filled: it isn't yours.
 * `style` sets the width inside the swipe row.
 */
export function SurpriseCard({ style }: { style?: ViewStyle }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Kept after closing, so the sheet still shows it while it slides away.
  const [picked, setPicked] = useState<ExerciseId>(ONE_GO[0]);
  return (
    // The wrapper clips the ripple to the card's corners.
    <View
      className="overflow-hidden rounded-3xl border border-line"
      style={[
        {
          backgroundImage: `radial-gradient(ellipse at 85% 15%, ${colors.surface} 0%, ${colors.ground} 70%)`,
        },
        style,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Surprise me: a random exercise, once"
        android_ripple={{ color: colors.line }}
        onPress={() => {
          setPicked(ONE_GO[Math.floor(Math.random() * ONE_GO.length)]);
          setOpen(true);
        }}
        // grow, not flex-1: alone the card sizes to its content; in the row it stretches to the tallest card.
        className="grow gap-5 p-5"
      >
        <View className="flex-row justify-between">
          <Text className="font-mono text-xs tracking-widest text-muted">SURPRISE ME</Text>
          <Text className="font-mono text-xs tracking-widest text-muted">ONE GO</Text>
        </View>

        <View className="grow flex-row items-end justify-between gap-3">
          <Text className="font-sans text-3xl font-light leading-none tracking-tight text-chalk">
            A random set,{'\n'}right now
          </Text>
          <Glyph d={DIE} size={88} box={32} weight={0.7} />
        </View>

        {/* Always five tiles and a count, however many exercises there are. */}
        <View className="flex-row items-center justify-between border-t border-line pt-4">
          <ExerciseStack steps={EVERY} />
          <View className="h-11 justify-center rounded-full bg-accent px-6" style={lit}>
            <Text className="font-sans text-base font-semibold tracking-tight text-ground">
              Start
            </Text>
          </View>
        </View>
      </Pressable>
      <SurpriseSheet
        open={open}
        exercise={picked}
        onDismiss={() => setOpen(false)}
        onStart={() => {
          setOpen(false);
          router.push({ pathname: '/workout/[id]', params: { id: picked } });
        }}
      />
    </View>
  );
}
