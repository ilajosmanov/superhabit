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
  withDays,
  type Draft,
} from '@/challenges/draft';
import { isHold } from '@/challenges/hold';
import { IconButton } from '@/components/icon-button';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { Segments } from '@/components/segments';
import { SwitchRow } from '@/components/switch-row';
import { EXERCISES } from '@/exercises/registry';
import { useColors } from '@/components/colors';
import { MAX, MAX_DAYS, type Challenge } from '@/workout/plan/plan';

import { AmountInput } from './amount-input';

const label = 'font-mono text-xs tracking-widest text-muted';
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
  const colors = useColors();
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
              cursorColor={colors.mark}
              selectionColor={colors.line}
              selectionHandleColor={colors.mark}
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
              color={focused ? colors.mark : colors.muted}
              onPress={() => nameField.current?.focus()}
              edge
            />
          </View>
          {/* Focus restyles through `style`: a changing class list remounts the view (react-native-css). */}
          <View
            className="border-b"
            style={{
              borderColor: focused ? colors.mark : colors.edge,
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
        <AmountInput
          value={draft.days}
          range={{ min: 1, max: 30, step: 1 }}
          limit={MAX_DAYS}
          labels={['DAYS']}
          name="Days"
          onChange={(days) => {
            if (days !== 'max') setDraft((d) => withDays(d, days));
          }}
        />
        {draft.days === MAX_DAYS && (
          <Text className="font-sans text-sm text-muted">Up to {MAX_DAYS} days per challenge.</Text>
        )}
        <Segments
          choices={DAY_CHOICES}
          value={draft.days}
          onChange={(days) => setDraft((d) => withDays(d, days))}
        />
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
