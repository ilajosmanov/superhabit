import { Pressable, Text, View } from 'react-native';

import { RepCount } from '@/components/rep-count';
import type { SessionView } from '@/workout/session';

// shortcut: this panel and BetweenSets belong to workout; move them into workout/components as
// feature UI grows, keeping src/components for shared UI.
/** The counting overlay: set label, rep count, phase, no-reps, last-rep stats, Reset / End set. */
export function SetPanel({
  view,
  landscape,
  onReset,
  onEndSet,
}: {
  view: SessionView;
  landscape: boolean;
  onReset: () => void;
  onEndSet: () => void;
}) {
  return (
    <View
      className={`absolute gap-2 rounded-3xl border border-line bg-ground/90 p-4 ${
        landscape ? 'bottom-4 right-4 top-4 w-60' : 'inset-x-3 bottom-8'
      }`}
    >
      {view.stage === 'finished' ? (
        <Text className="font-mono text-xs tracking-widest text-accent">CHALLENGE DONE</Text>
      ) : (
        view.sets > 1 && (
          <Text className="font-mono text-xs tracking-widest text-muted">
            {view.name.toUpperCase()} · SET {view.set} OF {view.sets}
          </Text>
        )
      )}
      <View className={landscape ? 'gap-2' : 'flex-row items-end justify-between'}>
        <RepCount reps={view.reps} target={view.target} />
        <View className={`gap-1 ${landscape ? '' : 'items-end pb-3'}`}>
          <Text className="font-mono text-xs tracking-widest text-muted">
            {view.phase.toUpperCase()}
          </Text>
          <Text className="font-mono text-xs tracking-widest text-warn">NO-REPS {view.noReps}</Text>
        </View>
      </View>
      {view.stats && (
        <Text className="font-mono text-xs tracking-widest text-muted">{view.stats}</Text>
      )}
      {view.stage === 'counting' && (
        <View className={`flex-row gap-2 ${landscape ? 'mt-auto' : ''}`}>
          <Pressable
            onPress={onReset}
            className="h-12 flex-1 items-center justify-center rounded-full bg-accent"
            accessibilityRole="button"
          >
            <Text className="font-sans text-base font-medium text-ground">Reset</Text>
          </Pressable>
          <Pressable
            onPress={onEndSet}
            className="h-12 flex-1 items-center justify-center rounded-full border border-edge"
            accessibilityRole="button"
          >
            <Text className="font-sans text-base font-medium text-chalk">End set</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
