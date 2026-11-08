import {
  AlertDialog,
  Host,
  SegmentedButton,
  SingleChoiceSegmentedButtonRow,
  Slider,
  Text as ComposeText,
  TextButton as ComposeTextButton,
} from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { AndroidHaptics, performAndroidHapticsAsync } from 'expo-haptics';
import { useRef, useState } from 'react';
import { Text, TextInput, View, type TextInputInstance } from 'react-native';

import { addDays, dayLabel, runOn, today } from '@/challenges/days';
import {
  autoName,
  DAY_CHOICES,
  RANGE,
  toChallenge,
  unitOf,
  withAmount,
  type Draft,
} from '@/challenges/draft';
import type { Saved } from '@/challenges/saved';
import { IconButton } from '@/components/icon-button';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { SwitchRow } from '@/components/switch-row';
import { EXERCISES } from '@/exercises/registry';
import { colors } from '@/theme';
import type { Challenge, Goal } from '@/workout/plan';

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
 * ticks and reports only real changes.
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
  const value = goal.type === 'max' ? top : goal.n;
  return (
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

/** Leaving deletes the run's days, so it asks first, in the platform's dialog. */
function LeaveButton({ onLeave }: { onLeave: () => void }) {
  const [asking, setAsking] = useState(false);
  return (
    <>
      {/* A disc as tall as Save beside it, red like the dialog's Leave. */}
      <IconButton
        icon="delete"
        label="Leave challenge"
        color={colors.warn}
        fill={colors.line}
        diameter={60}
        onPress={() => setAsking(true)}
      />
      {asking && (
        // Out of the footer row's flow: the dialog draws in its own window, but its host would take a slot.
        <Host matchContents style={{ position: 'absolute' }}>
          <AlertDialog
            onDismissRequest={() => setAsking(false)}
            colors={{
              containerColor: colors.surface,
              titleContentColor: colors.chalk,
              textContentColor: colors.soft,
            }}
          >
            <AlertDialog.Title>
              <ComposeText style={{ fontFamily: 'Geist', fontSize: 22 }}>
                Leave this challenge?
              </ComposeText>
            </AlertDialog.Title>
            <AlertDialog.Text>
              <ComposeText style={{ fontFamily: 'Geist', fontSize: 15 }}>
                Its days so far are deleted.
              </ComposeText>
            </AlertDialog.Text>
            <AlertDialog.ConfirmButton>
              <ComposeTextButton onClick={onLeave}>
                <ComposeText color={colors.warn} style={FONT}>
                  Leave
                </ComposeText>
              </ComposeTextButton>
            </AlertDialog.ConfirmButton>
            <AlertDialog.DismissButton>
              <ComposeTextButton onClick={() => setAsking(false)}>
                <ComposeText color={colors.chalk} style={FONT}>
                  Cancel
                </ComposeText>
              </ComposeTextButton>
            </AlertDialog.DismissButton>
          </AlertDialog>
        </Host>
      )}
    </>
  );
}

// shortcut: Jetpack Compose controls, so Android only; add the SwiftUI ones when iOS ships.
/**
 * Name a one-exercise challenge and set its numbers (design 05b): the title is the name field (React
 * Native's: Compose's BasicTextField takes only a family's regular face, not Geist 200), the
 * giant numeral follows the slider, then days and the restart rule. `history` is the run so far of a
 * challenge you are in; a new one starts today.
 */
export function Builder({
  initial,
  history,
  action,
  onSave,
  onLeave,
}: {
  initial: Draft;
  history?: Pick<Saved, 'startedOn' | 'progress'>;
  action: string;
  onSave: (challenge: Challenge) => void;
  /** Given when editing a challenge you are in. */
  onLeave?: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [focused, setFocused] = useState(false);
  const nameField = useRef<TextInputInstance>(null);
  const exercise = EXERCISES[draft.exercise];
  const { goal } = draft;
  const hold = exercise.kind === 'hold';
  // The run's own day 1 under the rules as set now (later than the join day after a restart); a run that
  // would be over ends from today.
  const from =
    (history && runOn(draft, history.startedOn, history.progress, today())?.from) ?? today();

  return (
    <Screen
      footer={
        <View className="flex-row gap-3">
          {onLeave && <LeaveButton onLeave={onLeave} />}
          <PrimaryButton
            label={action}
            onPress={() => onSave(toChallenge(draft))}
            className="h-15 flex-1"
          />
        </View>
      }
    >
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
        {/* Clipped so the numeral sits on its baseline, like the challenge page. */}
        <View
          accessible
          accessibilityLabel={`${goal.type === 'max' ? (hold ? 'As long as you can' : 'As many as you can') : `${goal.n} ${hold ? 'seconds' : 'reps'}`} every day`}
          className="flex-row items-end justify-between overflow-hidden"
        >
          <Text className="-ml-1.5 font-sans text-9xl font-extralight leading-none tracking-tighter text-chalk">
            {goal.type === 'max' ? 'Max' : goal.n}
          </Text>
          <View className="items-end gap-1 pb-4">
            <Text className={label}>{hold ? 'SECONDS' : 'CLEAN REPS'}</Text>
            <Text className={label}>EVERY DAY</Text>
          </View>
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
