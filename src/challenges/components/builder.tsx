import {
  Host,
  SegmentedButton,
  SingleChoiceSegmentedButtonRow,
  Slider,
  Text as ComposeText,
} from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { AndroidHaptics, performAndroidHapticsAsync } from 'expo-haptics';
import { useRef, useState } from 'react';
import { Text, TextInput, View, type TextInputInstance } from 'react-native';

import { addDays, dayLabel, type Day } from '@/workout/plan/day';
import {
  autoName,
  DAY_CHOICES,
  RANGE,
  toChallenge,
  unitOf,
  withAmount,
  withNumber,
  type Draft,
} from '@/challenges/draft';
import { IconButton } from '@/components/icon-button';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { SwitchRow } from '@/components/switch-row';
import { EXERCISES } from '@/exercises/registry';
import { colors } from '@/theme';
import type { Challenge, Goal } from '@/workout/plan/plan';

const label = 'font-mono text-xs tracking-widest text-muted';
const FONT = { fontFamily: 'Geist', fontWeight: '500', fontSize: 15 } as const;
// The segmented row's inactive fill and the switch's off track sit just off the ground.
const SEGMENT = {
  activeContainerColor: colors.line,
  inactiveContainerColor: colors.ground,
  activeBorderColor: colors.edge,
  inactiveBorderColor: colors.edge,
  activeContentColor: colors.chalk,
  inactiveContentColor: colors.muted,
};

/**
 * The daily number on the M3 slider, in fives of reps or tens of seconds, with Max one stop past the top;
 * ticks and reports only real changes. A typed number past either end sits at that end.
 */
function AmountSlider({
  unit,
  goal,
  onChange,
}: {
  unit: 'reps' | 'seconds';
  goal: Goal;
  onChange: (n: number) => void;
}) {
  const { min, max, step } = RANGE[unit];
  const top = max + step;
  const value = goal.type === 'max' ? top : Math.min(max, Math.max(min, goal.n));
  return (
    // shortcut: its ends sit near the back-gesture zone, so a drag to the first or last stop can take two
    // tries; typing the number covers it. Exclude the slider from system gestures if @expo/ui exposes it.
    <Host matchContents={{ vertical: true }}>
      <Slider
        value={value}
        min={min}
        max={top}
        // Compose counts the stops between the ends.
        steps={(top - min) / step - 1}
        colors={{
          thumbColor: colors.accent,
          activeTrackColor: colors.accent,
          inactiveTrackColor: colors.line,
          activeTickColor: 'transparent',
          inactiveTickColor: 'transparent',
        }}
        onValueChange={(next) => {
          const n = Math.round(next / step) * step;
          if (n === value) return;
          void performAndroidHapticsAsync(AndroidHaptics.Segment_Frequent_Tick);
          onChange(n);
        }}
      />
    </Host>
  );
}

// shortcut: Jetpack Compose controls, so Android only; add the SwiftUI ones when iOS ships.
/**
 * Name a one-exercise challenge and set its numbers (design 05b): the title is the name field (React
 * Native's: Compose's BasicTextField takes only a family's regular face, not Geist 200), the
 * giant numeral (a field too: type any number) follows the slider, then days and the restart rule. `from` is day 1 of the run: the one you
 * are in, or today for a new one.
 */
export function Builder({
  initial,
  from,
  action,
  onSave,
}: {
  initial: Draft;
  from: Day;
  action: string;
  onSave: (challenge: Challenge) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [focused, setFocused] = useState(false);
  // The numeral's text while you type in it; null when the field is not focused.
  const [typing, setTyping] = useState<string | null>(null);
  const nameField = useRef<TextInputInstance>(null);
  const exercise = EXERCISES[draft.exercise];
  const { goal } = draft;
  const hold = exercise.kind === 'hold';

  return (
    <Screen footer={<PrimaryButton label={action} onPress={() => onSave(toChallenge(draft))} />}>
      <View className="gap-3">
        <View className="gap-1">
          <View className="flex-row items-center gap-3">
            <TextInput
              ref={nameField}
              accessibilityLabel="Challenge name"
              value={draft.name ?? autoName(draft)}
              onChangeText={(text) =>
                setDraft((d) => ({ ...d, name: text === autoName(d) ? null : text }))
              }
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              maxLength={24}
              autoCapitalize="sentences"
              autoCorrect={false}
              returnKeyType="done"
              cursorColor={colors.accent}
              selectionColor={colors.line}
              selectionHandleColor={colors.accent}
              // Emptied, the field saves under the exercise's name, so it shows it.
              placeholder={autoName(draft)}
              placeholderTextColor={colors.faint}
              // One line's height (text-5xl × leading-tight): empty, Android measures by the font's taller
              // metrics instead of the line height, and the field would grow.
              className="h-15 flex-1 p-0 font-sans text-5xl font-extralight leading-tight tracking-tighter text-chalk"
            />
            <IconButton
              icon="edit"
              label="Edit name"
              color={focused ? colors.accent : colors.muted}
              onPress={() => nameField.current?.focus()}
              style={{ marginRight: -12 }}
            />
          </View>
          {/* Focus restyles through `style`: a changing class list remounts the view (react-native-css). */}
          <View
            className="border-b"
            style={{
              borderColor: focused ? colors.accent : colors.edge,
              borderStyle: focused ? 'solid' : 'dashed',
            }}
          />
        </View>
        <Text className={label}>
          {exercise.name.toUpperCase()} · {exercise.place.toUpperCase()}
        </Text>
      </View>

      <View className="gap-5">
        <View className="gap-1">
          {/* Clipped so the numeral sits on its baseline, like the challenge page. */}
          <View className="flex-row items-end justify-between overflow-hidden">
            {/* The numeral is a field: any whole number, past the slider's range or between its stops. */}
            <TextInput
              accessibilityLabel={hold ? 'Seconds every day' : 'Reps every day'}
              value={typing ?? (goal.type === 'max' ? 'Max' : String(goal.n))}
              // Max has no number to edit: the field opens empty, Max as its placeholder.
              onFocus={() => setTyping(goal.type === 'max' ? '' : String(goal.n))}
              onBlur={() => setTyping(null)}
              onChangeText={(text) => {
                const digits = text.replace(/\D/g, '');
                setTyping(digits);
                // Emptied or 0, the goal keeps its last number until you type one.
                if (Number(digits) >= 1) setDraft((d) => withNumber(d, Number(digits)));
              }}
              keyboardType="number-pad"
              maxLength={3}
              returnKeyType="done"
              selectTextOnFocus
              cursorColor={colors.accent}
              selectionColor={colors.line}
              selectionHandleColor={colors.accent}
              placeholder={goal.type === 'max' ? 'Max' : String(goal.n)}
              placeholderTextColor={colors.faint}
              // One line's height (text-9xl × leading-none), pinned: empty, Android measures by the font's
              // taller metrics and the field would grow.
              className="-ml-1.5 h-32 flex-1 p-0 font-sans text-9xl font-extralight leading-none tracking-tighter text-chalk"
            />
            <View className="items-end gap-1 pb-4">
              <Text className={label}>{hold ? 'SECONDS' : 'CLEAN REPS'}</Text>
              <Text className={label}>EVERY DAY</Text>
            </View>
          </View>
          {/* Underlined like the name: it's editable. Focus restyles through `style`, as the name's does. */}
          <View
            className="border-b"
            style={{
              borderColor: typing !== null ? colors.accent : colors.edge,
              borderStyle: typing !== null ? 'solid' : 'dashed',
            }}
          />
        </View>
        <AmountSlider
          unit={unitOf(draft.exercise)}
          goal={goal}
          onChange={(n) => setDraft((d) => withAmount(d, n))}
        />
      </View>

      <View className="gap-3">
        <View className="flex-row justify-between">
          <Text className={label}>DAYS</Text>
          <Text className={label}>ENDS {dayLabel(addDays(from, draft.days - 1))}</Text>
        </View>
        <Host matchContents={{ vertical: true }}>
          <SingleChoiceSegmentedButtonRow modifiers={[fillMaxWidth()]}>
            {DAY_CHOICES.map((days) => (
              <SegmentedButton
                key={days}
                selected={days === draft.days}
                onClick={() => {
                  if (days !== draft.days)
                    void performAndroidHapticsAsync(AndroidHaptics.Segment_Tick);
                  setDraft((d) => ({ ...d, days }));
                }}
                colors={SEGMENT}
              >
                <SegmentedButton.Label>
                  <ComposeText style={FONT}>{String(days)}</ComposeText>
                </SegmentedButton.Label>
              </SegmentedButton>
            ))}
          </SingleChoiceSegmentedButtonRow>
        </Host>
      </View>

      <SwitchRow
        label="Start over if I miss a day"
        note={
          draft.restartOnMiss
            ? 'A day with no try sends you back to day 1.'
            : 'A missed day stays empty; the run goes on.'
        }
        value={draft.restartOnMiss}
        onChange={(restartOnMiss) => setDraft((d) => ({ ...d, restartOnMiss }))}
      />
    </Screen>
  );
}
