import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import type { SessionView } from '@/workout/session-view';

import { Chip, SPEAKER_OFF, SPEAKER_ON } from './controls';

export type PlatterProps = {
  view: SessionView;
  landscape: boolean;
  angle: SharedValue<number | null>;
  lowest: SharedValue<number | null>;
  onPause: () => void;
  onEndSet: () => void;
  onResume: () => void;
  onRestart: () => void;
  onEnd: () => void;
  onToggleVoice: () => void;
  onToggleSkeleton: () => void;
  onFlipCamera: () => void;
};

export const setLabel = ({ name, set, sets }: SessionView) =>
  `${name.toUpperCase()}${sets > 1 ? ` · ${set} OF ${sets}` : ''}`;

/** Label row with `children` chips; the mute chip lives here in landscape, in the top bar in portrait. */
export function Header({
  view,
  landscape,
  onToggleVoice,
  children,
}: PlatterProps & { children?: ReactNode }) {
  return (
    <View className={`flex-row items-center justify-between ${landscape ? 'h-9' : ''}`}>
      <Text
        numberOfLines={1}
        className="shrink font-mono text-xs font-medium tracking-widest text-muted"
      >
        {setLabel(view)}
      </Text>
      <View className="flex-row gap-2">
        {children}
        {landscape && (
          <Chip
            d={view.muted ? SPEAKER_OFF : SPEAKER_ON}
            label="Voice coach"
            checked={!view.muted}
            onPress={onToggleVoice}
          />
        )}
      </View>
    </View>
  );
}
