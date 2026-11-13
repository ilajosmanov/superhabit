import { Host, Slider } from '@expo/ui/jetpack-compose';
import { semantics } from '@expo/ui/jetpack-compose/modifiers';
import { AndroidHaptics } from 'expo-haptics';
import { useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import type { Amount } from '@/challenges/draft';
import { tick } from '@/components/tick';
import { useColors } from '@/components/colors';

const label = 'font-mono text-xs tracking-widest text-muted';

/**
 * A number to set, as the builder shows it (design 05b): the giant numeral is a field (type any whole
 * number from 1, in or past the slider's range), its words on the right, and the M3 slider on `range`'s
 * stops under it. With `max`, one stop past the top is Max.
 */
export function AmountInput({
  value,
  range: { min, max, step },
  max: offersMax = false,
  limit = Infinity,
  labels,
  name,
  onChange,
}: {
  value: Amount;
  range: { min: number; max: number; step: number };
  max?: boolean;
  /** Hard limit for typed counts, independent of the slider range. */
  limit?: number;
  /** The words beside the numeral: its unit, then what it counts ("EVERY DAY"). */
  labels: readonly string[];
  /** What TalkBack calls the field and the slider. */
  name: string;
  onChange: (amount: Amount) => void;
}) {
  const colors = useColors();
  // The numeral's text while you type in it; null when the field is not focused.
  const [typing, setTyping] = useState<{ text: string; amount: Amount } | null>(null);
  const sliding = useRef<number | null>(null);
  const top = offersMax ? max + step : max;
  const at = value === 'max' ? top : Math.min(max, Math.max(min, value));
  const shown = value === 'max' ? 'Max' : String(value);
  // Reset, Back to suggested, or a slider drag must also update a still-focused field.
  if (typing !== null && typing.amount !== value) {
    setTyping({ text: shown, amount: value });
  }

  function selectStop(next: number) {
    const n = min + Math.round((next - min) / step) * step;
    const amount = n > max ? 'max' : n;
    setTyping((current) =>
      current === null ? null : { text: amount === 'max' ? 'Max' : String(amount), amount },
    );
    if (amount === value) return;
    tick(AndroidHaptics.Segment_Frequent_Tick);
    onChange(amount);
  }

  return (
    <View className="gap-5">
      <View className="gap-1">
        {/* Clipped so the numeral sits on its baseline, like the challenge page. */}
        <View className="flex-row items-end justify-between overflow-hidden">
          <TextInput
            accessibilityLabel={name}
            value={typing?.text ?? shown}
            // Max has no number to edit: the field opens empty, Max as its placeholder.
            onFocus={() => setTyping({ text: value === 'max' ? '' : shown, amount: value })}
            onBlur={() => setTyping(null)}
            onChangeText={(text) => {
              const digits = text.replace(/\D/g, '');
              const n = Math.min(Number(digits), limit);
              setTyping({
                text: Number(digits) > limit ? String(n) : digits,
                amount: n >= 1 ? n : value,
              });
              // Emptied or 0, the number stays until you type one.
              if (n >= 1) onChange(n);
            }}
            keyboardType="number-pad"
            maxLength={3}
            returnKeyType="done"
            selectTextOnFocus
            cursorColor={colors.mark}
            selectionColor={colors.line}
            selectionHandleColor={colors.mark}
            placeholder={shown}
            placeholderTextColor={colors.faint}
            // One line's height (text-9xl × leading-none), pinned, so a larger system font would clip: empty,
            // Android measures by the font's taller metrics and the field would grow.
            maxFontSizeMultiplier={1}
            className="-ml-1.5 h-32 flex-1 p-0 font-sans text-9xl font-extralight leading-none tracking-tighter text-chalk"
          />
          <View className="items-end gap-1 pb-4">
            {labels.map((words) => (
              <Text key={words} className={label}>
                {words}
              </Text>
            ))}
          </View>
        </View>
        {/* Underlined: it's editable. Focus restyles through `style`: a changing class list remounts the view. */}
        <View
          className="border-b"
          style={{
            borderColor: typing !== null ? colors.mark : colors.edge,
            borderStyle: typing !== null ? 'solid' : 'dashed',
          }}
        />
      </View>
      {/* shortcut: its ends sit near the back-gesture zone, so a drag to the first or last stop can take two
          tries; typing the number covers it. Exclude the slider from system gestures if @expo/ui exposes it. */}
      <Host matchContents={{ vertical: true }}>
        <Slider
          modifiers={[semantics({ contentDescription: name })]}
          value={at}
          min={min}
          max={top}
          // Compose counts the stops between the ends.
          steps={Math.max(0, (top - min) / step - 1)}
          colors={{
            thumbColor: colors.accent,
            activeTrackColor: colors.accent,
            inactiveTrackColor: colors.line,
            activeTickColor: 'transparent',
            inactiveTickColor: 'transparent',
          }}
          onValueChange={(next) => {
            sliding.current = next;
            selectStop(next);
          }}
          onValueChangeFinished={() => {
            // Tapping the already-clamped endpoint may finish without a value-change event.
            selectStop(sliding.current ?? at);
            sliding.current = null;
          }}
        />
      </Host>
    </View>
  );
}
