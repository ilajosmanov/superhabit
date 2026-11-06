import { Text, View } from 'react-native';

import { Caption, Clock, CloseButton, Frame, MuteButton } from './controls';
import { SetPlatter, type PlatterProps } from './set-platter';

/**
 * Boards 09–13 over the full-bleed camera: the free camera area (✕ and clock, the coach's caption,
 * "Paused") and the set platter, side by side in landscape, stacked in portrait.
 */
export function LiveView(props: PlatterProps) {
  const { view, landscape, onPause, onToggleVoice } = props;
  const paused = view.stage === 'paused';
  // While counting ✕ only pauses: ending is one more tap on the paused platter, so a stray tap loses nothing.
  const close = (
    <CloseButton onPress={onPause} label="End challenge" hint="Pauses first; then resume or end" />
  );
  const clock = (
    <Clock
      elapsedS={view.elapsedS}
      recording={view.recording}
      waiting={view.phase === 'waiting' && !view.started}
    />
  );

  return (
    <>
      {paused && <View className="absolute inset-0 bg-ground/60" />}
      <Frame landscape={landscape}>
        <View className="flex-1 justify-between">
          {paused ? (
            <View />
          ) : landscape ? (
            <View className="flex-row items-center gap-2 self-start">
              {close}
              {clock}
            </View>
          ) : (
            <View className="flex-row items-center justify-between">
              {close}
              {clock}
              <MuteButton muted={view.muted} onPress={onToggleVoice} glass />
            </View>
          )}
          {paused && (
            <View className="items-center gap-2.5">
              <Text
                accessibilityRole="header"
                className="font-sans text-6xl font-extralight leading-none tracking-tight text-chalk"
              >
                Paused
              </Text>
              <Text className="font-mono text-xs font-medium tracking-widest text-soft">
                NOT COUNTING
              </Text>
            </View>
          )}
          <View className={landscape ? 'items-start' : 'items-center'}>
            {view.caption && <Caption text={view.caption} />}
          </View>
        </View>
        <SetPlatter {...props} />
      </Frame>
    </>
  );
}
