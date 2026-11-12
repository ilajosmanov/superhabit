import { useState } from 'react';
import { Text, View } from 'react-native';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { Icon } from '@/components/icon';
import { mss } from '@/lib/duration';
import { PrimaryButton } from '@/components/primary-button';
import { TextButton } from '@/components/text-button';
import { dark as colors } from '@/theme';
import { setLabel, type PlatterProps } from './platter-header';
import { RepCount } from './rep-count';
import { RepStrip } from './rep-strip';

/**
 * Board 12: nothing counts; resume, restart the set, or end the workout. When the camera stopped, Resume
 * tries it again; when tracking can't start on this phone, only End is left (the sets so far are kept).
 */
export function PausedSet(props: PlatterProps) {
  const { view, landscape, onResume, onRestart, onEnd } = props;
  const [asking, setAsking] = useState(false);
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
      {view.broken && (
        <View accessibilityLiveRegion="polite" className="flex-row items-center gap-2">
          <Icon
            name={view.broken === 'camera' ? 'videocam_off' : 'error'}
            size={18}
            color={colors.warn}
          />
          <Text className="flex-1 font-sans text-sm text-chalk">
            {view.broken === 'camera'
              ? 'The camera stopped.'
              : "Tracking can't start on this phone. Your sets so far are kept."}
          </Text>
        </View>
      )}
      <View className={landscape ? 'mt-auto gap-1.5' : 'mt-2 gap-2'}>
        {view.broken !== 'tracking' && (
          <PrimaryButton
            onPress={onResume}
            label={view.broken === 'camera' ? 'Try the camera again' : 'Resume'}
            className={landscape ? 'h-11' : 'h-13'}
          />
        )}
        {!view.broken && (
          <TextButton
            onPress={() => (view.started ? setAsking(true) : onRestart())}
            label="Restart set"
            wide
          />
        )}
        <TextButton label="End workout" onPress={onEnd} style={{ alignSelf: 'center' }} />
      </View>
      {asking && (
        <ConfirmDialog
          title="Restart this set?"
          text="What you counted in this set is cleared."
          action="Restart"
          onConfirm={() => {
            setAsking(false);
            onRestart();
          }}
          onCancel={() => setAsking(false)}
        />
      )}
    </>
  );
}
