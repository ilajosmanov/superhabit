import { Text, View } from 'react-native';

import { mss, SecondaryButton } from './controls';
import { PrimaryButton } from '@/components/primary-button';
import { TextButton } from '@/components/text-button';
import { colors } from '@/theme';
import { setLabel, type PlatterProps } from './platter-header';
import { RepCount } from './rep-count';
import { RepStrip } from './rep-strip';

/** Board 12: nothing counts; resume, restart the set, or end the challenge. */
export function PausedSet(props: PlatterProps) {
  const { view, landscape, onResume, onRestart, onEnd } = props;
  // Landscape compacts so all of it fits a 360dp-tall screen; portrait keeps the full sizes.
  return (
    <>
      <Text
        numberOfLines={1}
        className="shrink font-mono text-xs font-medium tracking-widest text-muted"
      >
        {setLabel(view)} · {mss(view.elapsedS)}
      </Text>
      <View className="flex-row items-end justify-between">
        <RepCount
          reps={view.unit === 'seconds' ? view.heldS : view.reps}
          target={view.unit === 'seconds' ? view.goalS : view.target}
          unit={view.unit}
          size={landscape ? 'sm' : 'md'}
        />
        {view.gauge && view.attempts.length > 0 && (
          <View className="items-end gap-1.5 pb-2">
            <RepStrip attempts={view.attempts} gauge={view.gauge} bar={9} />
            <Text className="font-mono text-xs tracking-widest text-muted">THIS SET</Text>
          </View>
        )}
      </View>
      <View className={landscape ? 'mt-auto gap-1.5' : 'mt-2 gap-2'}>
        <PrimaryButton onPress={onResume} label="Resume" className={landscape ? 'h-11' : 'h-13'} />
        <SecondaryButton
          onPress={onRestart}
          label="Restart set"
          className={landscape ? 'h-9' : 'h-11'}
        />
        <TextButton
          label="End challenge"
          color={colors.warn}
          onPress={onEnd}
          style={{ alignSelf: 'center' }}
        />
      </View>
    </>
  );
}
