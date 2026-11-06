import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CLOSE, Glyph } from '@/components/glyph';
import { colors, lit as litStyle } from '@/theme';

const SPEAKER = 'M11 5 6 9H3v6h3l5 4V5ZM15.5 8.5a5 5 0 0 1 0 7';
export const SPEAKER_ON = `${SPEAKER}M18.5 5.5a9 9 0 0 1 0 13`;
export const SPEAKER_OFF = 'M11 5 6 9H3v6h3l5 4V5ZM16 9.5l5 5M21 9.5l-5 5';

// shortcut: no blur; Android can't blur the camera's SurfaceView. Revisit if the preview moves to a TextureView.
/** The floating material over the camera: surface at 75 %, a faint chalk hairline. */
export const GLASS = 'border border-chalk/10 bg-surface/75';

/** 312 -> "5:12". */
export const mss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

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

export function CloseButton({
  onPress,
  label,
  hint,
}: {
  onPress: () => void;
  label: string;
  hint?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      className={`size-11 items-center justify-center rounded-full ${GLASS}`}
    >
      <Glyph d={CLOSE} size={18} />
    </Pressable>
  );
}

/** Voice coach on/off, glass on the camera (portrait top bar); the platter uses a `Chip` in landscape. */
export function MuteButton({ muted, onPress }: { muted: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="switch"
      accessibilityLabel="Voice coach"
      accessibilityState={{ checked: !muted }}
      className={`size-11 items-center justify-center rounded-full ${GLASS}`}
    >
      <Glyph d={muted ? SPEAKER_OFF : SPEAKER_ON} size={18} />
    </Pressable>
  );
}

/** A filled 36px icon chip inside the platter; a switch when `checked` is given (muted glyph when off). */
export function Chip({
  d,
  label,
  checked,
  onPress,
}: {
  d: string;
  label: string;
  checked?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={checked === undefined ? 'button' : 'switch'}
      accessibilityLabel={label}
      accessibilityState={checked === undefined ? undefined : { checked }}
      className="size-9 items-center justify-center rounded-full bg-chalk/10"
    >
      <Glyph d={d} size={16} color={checked === false ? colors.muted : colors.chalk} />
    </Pressable>
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
      <Glyph d={SPEAKER} size={16} color={colors.muted} />
      <Text numberOfLines={1} className="shrink font-sans text-lg text-chalk">
        “{/[.!?]$/.test(text) ? text : `${text}.`}”
      </Text>
    </View>
  );
}

/**
 * The amber primary button. `className` sizes it. `lit` makes it the physical key (lit from above, a press
 * ripple); wrap a lit one in `overflow-hidden rounded-full` so the ripple keeps to its corners.
 */
export function PrimaryButton({
  onPress,
  label,
  className = 'h-14',
  hint,
  lit = false,
}: {
  onPress: () => void;
  label: string;
  className?: string;
  hint?: string;
  lit?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityHint={hint}
      // Ground at 16%, the same shade the hold-to-start fill uses.
      android_ripple={lit ? { color: `${colors.ground}29`, foreground: true } : undefined}
      className={`items-center justify-center rounded-full bg-accent px-4 ${className}`}
      style={lit ? litStyle : undefined}
    >
      <Text
        numberOfLines={1}
        className={`font-sans text-lg text-ground ${lit ? 'font-semibold tracking-tight' : 'font-medium'}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** A filled secondary button: chalk at 10 %, no border. `className` sizes it; a switch when `checked` is given. */
export function SecondaryButton({
  onPress,
  label,
  className = 'h-11',
  checked,
  hint,
}: {
  onPress: () => void;
  label: string;
  className?: string;
  checked?: boolean;
  hint?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={checked === undefined ? 'button' : 'switch'}
      accessibilityState={checked === undefined ? undefined : { checked }}
      accessibilityHint={hint}
      className={`items-center justify-center rounded-full bg-chalk/10 px-3 ${className}`}
    >
      <Text numberOfLines={1} className="font-sans text-base font-medium text-chalk">
        {label}
      </Text>
    </Pressable>
  );
}
