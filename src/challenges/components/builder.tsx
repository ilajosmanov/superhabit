import {
  Host,
  SegmentedButton,
  SingleChoiceSegmentedButtonRow,
  Text as ComposeText,
} from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { useRef, useState } from 'react';
import { Text, TextInput, View, type TextInputInstance } from 'react-native';

import { addDays, dayLabel, type Day } from '@/lib/day';
import {
  autoName,
  DAY_CHOICES,
  RANGE,
  toChallenge,
  unitOf,
  withNumber,
  type Draft,
} from '@/challenges/draft';
import { isHold } from '@/challenges/hold';
import { IconButton } from '@/components/icon-button';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { SwitchRow } from '@/components/switch-row';
import { tick } from '@/components/tick';
import { EXERCISES } from '@/exercises/registry';
import { colors, COMPOSE_LABEL } from '@/theme';
import { MAX, type Challenge } from '@/workout/plan/plan';

import { AmountInput } from './amount-input';

const label = 'font-mono text-xs tracking-widest text-muted';
// The segmented row's colours (the builder's and Your numbers'): the inactive fill sits just off the ground.
export const SEGMENT = {
  activeContainerColor: colors.line,
  inactiveContainerColor: colors.ground,
  activeBorderColor: colors.edge,
  inactiveBorderColor: colors.edge,
  activeContentColor: colors.chalk,
  inactiveContentColor: colors.muted,
};

const amountLabel = (unit: 'reps' | 'seconds') =>
  unit === 'seconds' ? 'Seconds every day' : 'Reps every day';

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
  const nameField = useRef<TextInputInstance>(null);
  const exercise = EXERCISES[draft.exercise];
  const { goal } = draft;

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
              // One line's height (text-5xl × leading-tight), so a larger system font would clip: empty,
              // Android measures by the font's taller metrics instead of the line height, and the field would grow.
              maxFontSizeMultiplier={1}
              className="h-15 flex-1 p-0 font-sans text-5xl font-extralight leading-tight tracking-tighter text-chalk"
            />
            <IconButton
              icon="edit"
              label="Edit name"
              color={focused ? colors.accent : colors.muted}
              onPress={() => nameField.current?.focus()}
              edge
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

      <AmountInput
        value={goal.type === 'max' ? 'max' : goal.n}
        range={RANGE[unitOf(draft.exercise)]}
        max={!draft.dailyTotal}
        labels={[isHold(draft.exercise) ? 'SECONDS' : 'CLEAN REPS', 'EVERY DAY']}
        name={amountLabel(unitOf(draft.exercise))}
        onChange={(amount) =>
          setDraft((d) => (amount === 'max' ? { ...d, goal: MAX } : withNumber(d, amount)))
        }
      />

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
                  if (days !== draft.days) tick();
                  setDraft((d) => ({ ...d, days }));
                }}
                colors={SEGMENT}
              >
                <SegmentedButton.Label>
                  <ComposeText style={COMPOSE_LABEL}>{String(days)}</ComposeText>
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
            ? 'A day below your goal sends you back to day 1.'
            : 'A missed day stays empty; the run goes on.'
        }
        value={draft.restartOnMiss}
        onChange={(restartOnMiss) => setDraft((d) => ({ ...d, restartOnMiss }))}
      />
    </Screen>
  );
}
