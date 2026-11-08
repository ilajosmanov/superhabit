import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AndroidSymbol } from 'expo-symbols';

import { mss } from '@/components/duration';
import { Icon } from '@/components/icon';
import { IconButton } from '@/components/icon-button';
import { colors } from '@/theme';

// shortcut: no blur; Android can't blur the camera's SurfaceView. Revisit if the preview moves to a TextureView.
/** The floating material over the camera: surface at 75 %, a faint chalk hairline. */
export const GLASS = 'border border-chalk/10 bg-surface/75';
/** GLASS's fill, for native buttons that take a colour (they draw no hairline). */
const GLASS_FILL = 'rgba(24,25,20,0.75)';
/** Chalk at 10 %: a chip's fill inside the platter. */
export const CHIP_FILL = 'rgba(242,240,232,0.1)';

/**
 * Lays session chrome over the full-bleed camera, 12px in from the safe area (camera cutout, system bars).
 * Landscape puts its children side by side (free camera area, then the platter); portrait stacks them.
 */
export function Frame({ landscape, children }: { landscape: boolean; children: ReactNode }) {
  const { top, bottom, left, right } = useSafeAreaInsets();
  return (
    <View
      className={`absolute inset-0 gap-3 ${landscape ? 'flex-row' : ''}`}
      style={{
        paddingTop: top + 12,
        paddingBottom: bottom + 12,
        paddingLeft: left + 12,
        paddingRight: right + 12,
      }}
    >
      {children}
    </View>
  );
}

export function CloseButton({ onPress, label }: { onPress: () => void; label: string }) {
  return <IconButton icon="close" label={label} size={20} fill={GLASS_FILL} onPress={onPress} />;
}

/** Voice coach on/off, glass on the camera (portrait top bar); the platter uses a `Chip` in landscape. */
export function MuteButton({ muted, onPress }: { muted: boolean; onPress: () => void }) {
  return (
    <IconButton
      icon={muted ? 'volume_off' : 'volume_up'}
      label="Voice coach"
      checked={!muted}
      size={20}
      fill={GLASS_FILL}
      onPress={onPress}
    />
  );
}

/** A filled icon chip inside the platter; a switch when `checked` is given (muted symbol when off). */
export function Chip({
  icon,
  label,
  checked,
  onPress,
}: {
  icon: AndroidSymbol;
  label: string;
  checked?: boolean;
  onPress: () => void;
}) {
  return (
    <IconButton
      icon={icon}
      label={label}
      checked={checked}
      size={18}
      color={checked === false ? colors.muted : colors.chalk}
      fill={CHIP_FILL}
      onPress={onPress}
    />
  );
}

/** Elapsed time; a REC dot while a take is filming, "NOT RECORDING" while waiting for the start position. */
export function Clock({
  elapsedS,
  recording,
  waiting,
}: {
  elapsedS: number;
  recording: boolean;
  waiting: boolean;
}) {
  const time = mss(elapsedS);
  const text = recording ? `REC ${time}` : waiting ? 'NOT RECORDING' : time;
  return (
    <View
      accessible
      accessibilityLabel={recording ? `Recording, ${time}` : text}
      className={`h-8 flex-row items-center gap-2 rounded-full px-3 ${GLASS}`}
    >
      {recording && <View className="size-2 rounded-full bg-warn" />}
      <Text
        className={`font-mono text-sm tracking-widest ${recording || !waiting ? 'text-chalk' : 'text-muted'}`}
      >
        {text}
      </Text>
    </View>
  );
}

/** The coach's last phrase, shown whether or not the voice is muted. */
export function Caption({ text }: { text: string }) {
  return (
    <View
      accessibilityLiveRegion="polite"
      className={`h-10 max-w-full flex-row items-center gap-2 rounded-full px-4 ${GLASS}`}
    >
      <Icon name="volume_up" size={16} color={colors.muted} />
      <Text numberOfLines={1} className="shrink font-sans text-lg text-chalk">
        “{/[.!?]$/.test(text) ? text : `${text}.`}”
      </Text>
    </View>
  );
}

/** A filled secondary button: chalk at 10 %, no border. `className` sizes it. */
export function SecondaryButton({
  onPress,
  label,
  className = 'h-11',
}: {
  onPress: () => void;
  label: string;
  className?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className={`items-center justify-center rounded-full bg-chalk/10 px-3 ${className}`}
    >
      <Text numberOfLines={1} className="font-sans text-base font-medium text-chalk">
        {label}
      </Text>
    </Pressable>
  );
}
