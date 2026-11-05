import { Pressable, Text, View } from 'react-native';

import { RepCount } from '@/components/rep-count';
import type { SessionView } from '@/workout/session';

// shortcut: a dark token scrim, not a blur. expo-blur on Android can't blur a SurfaceView camera preview; revisit if the preview moves to a TextureView.
/** Between sets, over the live camera: the finished set, then how to place the phone for the next one. */
export function BetweenSets({
  view,
  landscape,
  onContinue,
}: {
  view: SessionView;
  landscape: boolean;
  onContinue: () => void;
}) {
  const { next } = view;
  if (!next) return null;
  return (
    <View
      className={`absolute inset-0 gap-5 bg-ground/70 p-4 ${landscape ? 'flex-row items-end' : ''}`}
    >
      <View className={`gap-2.5 pt-3 ${landscape ? 'flex-1 self-start' : ''}`}>
        <Text className="font-mono text-xs font-medium tracking-widest text-soft">
          {view.name.toUpperCase()} · SET {view.set} OF {view.sets} DONE
        </Text>
        <RepCount reps={view.reps} target={view.target} />
        <View className="h-2 rounded-sm bg-accent" />
      </View>

      <View
        className={`gap-4 rounded-3xl border border-line bg-ground/90 p-5 ${landscape ? 'w-96' : 'mt-auto'}`}
      >
        <View className="gap-1.5">
          <Text className="font-mono text-xs font-medium tracking-widest text-muted">
            NEXT · {Number.isFinite(view.nextReps) ? `${view.nextReps} ` : ''}
            {next.name.toUpperCase()}
          </Text>
          <Text className="font-sans text-2xl font-light text-chalk">{next.place}</Text>
        </View>
        <View className="gap-2.5">
          {next.steps.map((step, i) => (
            <View key={step} className="flex-row gap-3">
              <Text className="w-5 pt-0.5 font-mono text-xs text-muted">{`0${i + 1}`}</Text>
              <Text className="flex-1 font-sans text-base text-soft">{step}</Text>
            </View>
          ))}
        </View>
        <Pressable
          onPress={onContinue}
          className="h-14 items-center justify-center rounded-full bg-accent"
          accessibilityRole="button"
        >
          <Text className="font-sans text-lg font-medium text-ground">Continue</Text>
        </Pressable>
        <Text className="text-center font-sans text-sm text-muted">{next.hint}</Text>
      </View>
    </View>
  );
}
