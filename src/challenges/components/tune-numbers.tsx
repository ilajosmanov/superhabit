import {
  Host,
  SegmentedButton,
  SingleChoiceSegmentedButtonRow,
  Text as ComposeText,
} from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { AmountInput } from './amount-input';
import { SEGMENT } from './builder';
import type { Amount } from '@/challenges/draft';
import {
  dayChoices,
  knobsOf,
  rangeOf,
  tuned,
  valueOf,
  type Knob,
  type Values,
} from '@/challenges/tune';
import { Icon } from '@/components/icon';
import { ExerciseFigure } from '@/components/illustrations';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { TextButton } from '@/components/text-button';
import { tick } from '@/components/tick';
import { EXERCISES } from '@/exercises/registry';
import { capitalise } from '@/lib/text';
import { colors, COMPOSE_LABEL } from '@/theme';
import type { Challenge } from '@/workout/plan/plan';

const label = 'font-mono text-xs tracking-widest text-muted';

/** A knob's number as its tile says it: 10, 30 S, ×3, 14 D. */
const caption = (knob: Knob, n: Amount) =>
  n === 'max'
    ? 'MAX'
    : knob.kind === 'seconds'
      ? `${n} S`
      : knob.kind === 'rounds'
        ? `×${n}`
        : knob.kind === 'days'
          ? `${n} D`
          : String(n);

const UNIT = { reps: 'CLEAN REPS', seconds: 'SECONDS', rounds: 'ROUNDS', days: 'DAYS' } as const;
const SPOKEN = { reps: 'reps', seconds: 'seconds', rounds: 'rounds', days: 'days' } as const;

/** What a knob is called, and the words beside its numeral. */
function names(knob: Knob, knobs: readonly Knob[], values: Values) {
  const parts = Math.max(...knobs.map((k) => (k.kind === 'days' ? 0 : k.block + 1)));
  if (knob.kind === 'days') return { name: 'Days', note: 'DAY 1 IS TODAY' };
  if (knob.kind === 'rounds') {
    const moves = knobs.flatMap((k) =>
      k.kind !== 'reps' && k.kind !== 'seconds' ? [] : k.block === knob.block ? [k.exercise] : [],
    );
    return parts > 1
      ? {
          name: `Rounds of part ${knob.block + 1}`,
          note: [...new Set(moves)].map((id) => EXERCISES[id].name.toUpperCase()).join(', '),
        }
      : { name: 'Rounds', note: 'THE WHOLE SESSION' };
  }
  const rounds = knobs.find((k) => k.kind === 'rounds' && k.block === knob.block);
  const roundCount = rounds ? valueOf(rounds, values) : 1;
  const many = typeof roundCount === 'number' && roundCount > 1;
  return {
    name: capitalise(EXERCISES[knob.exercise].name),
    note: many ? 'EACH ROUND' : 'EVERY DAY',
  };
}

/**
 * A suggested challenge's numbers before you join it (design 28), until the builder makes your own: a
 * tile per number in session order, the picked one as the giant numeral on the M3 slider (days: the
 * segmented row), and Join. Only numbers change, never the shape. `onJoin` gets
 * the challenge with your numbers, or null when you kept ours.
 */
export function TuneNumbers({
  challenge,
  onJoin,
}: {
  challenge: Challenge;
  onJoin: (yours: Challenge | null) => void;
}) {
  const knobs = knobsOf(challenge);
  const [values, setValues] = useState<Values>({});
  const [reset, setReset] = useState(0);
  const [picked, setPicked] = useState(0);
  const knob = knobs[Math.min(picked, knobs.length - 1)];
  const value = valueOf(knob, values);
  const changed = knobs.some((k) => valueOf(k, values) !== k.ours);
  const { name, note } = names(knob, knobs, values);
  const set = (n: Amount) => setValues((v) => ({ ...v, [knob.key]: n }));

  return (
    <Screen
      title="Your numbers"
      intro="Pick what you can finish on a tired day. Missing one costs more than an easy one."
      footer={
        <PrimaryButton
          label={changed ? 'Join with these numbers' : 'Join'}
          onPress={() => onJoin(changed ? tuned(challenge, values) : null)}
        />
      }
    >
      <Stack.Screen
        options={{
          headerRight: changed
            ? () => (
                <TextButton
                  label="Reset"
                  color={colors.soft}
                  onPress={() => {
                    setValues({});
                    setReset((n) => n + 1);
                  }}
                  edge
                />
              )
            : undefined,
        }}
      />

      {/* Every number you can change, in session order; the picked one is the numeral below. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="-mx-6"
        contentContainerClassName="gap-2 px-6"
        accessibilityRole="tablist"
      >
        {knobs.map((k, i) => {
          const n = valueOf(k, values);
          const on = k.key === knob.key;
          const moved = n !== k.ours;
          return (
            <Pressable
              key={k.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${names(k, knobs, values).name}, ${n} ${SPOKEN[k.kind]}${
                moved ? `, suggested ${k.ours}` : ''
              }`}
              onPress={() => {
                if (!on) tick();
                setPicked(i);
              }}
              className="w-15 items-center gap-2"
            >
              <View
                className="size-15 items-center justify-center rounded-2xl"
                style={{
                  borderWidth: on ? 1.5 : 1,
                  borderColor: on ? colors.soft : colors.line,
                  backgroundColor: on ? colors.surface : undefined,
                }}
              >
                {k.kind === 'reps' || k.kind === 'seconds' ? (
                  <ExerciseFigure exercise={k.exercise} size={30} />
                ) : (
                  <Icon
                    name={k.kind === 'rounds' ? 'repeat' : 'calendar_today'}
                    size={26}
                    color={colors.soft}
                  />
                )}
                {moved && (
                  <View className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-chalk" />
                )}
              </View>
              <Text
                className="font-mono text-xs tracking-widest"
                style={{ color: on ? colors.chalk : colors.muted }}
              >
                {caption(k, n)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View className="gap-3">
        <View className="flex-row items-baseline justify-between gap-3">
          <Text className="font-sans text-2xl tracking-tight text-chalk">{name}</Text>
          {(knob.kind === 'days' || knob.kind === 'rounds') && (
            <Text numberOfLines={1} className={`shrink ${label}`}>
              {note}
            </Text>
          )}
        </View>
        {knob.kind === 'days' ? (
          <>
            <View
              accessible
              accessibilityLabel={`${value} days`}
              className="-ml-1.5 flex-row items-end justify-between"
            >
              <Text
                maxFontSizeMultiplier={1}
                className="font-sans text-9xl font-extralight leading-none tracking-tighter text-chalk"
              >
                {value}
              </Text>
              <Text className={`pb-4 ${label}`}>DAYS</Text>
            </View>
            <Days choices={dayChoices(knob.ours)} value={value} onChange={set} />
          </>
        ) : (
          // Reset also clears typed text when the selected knob's saved amount is unchanged.
          <AmountInput
            key={`${knob.key}:${reset}`}
            value={value}
            range={rangeOf(knob)}
            max={knob.kind !== 'rounds' && !challenge.dailyTotal}
            labels={knob.kind === 'rounds' ? [UNIT[knob.kind]] : [UNIT[knob.kind], note]}
            name={name}
            onChange={set}
          />
        )}
        <View className="h-12 flex-row items-center justify-between">
          <Text className={label}>SUGGESTED {knob.ours === 'max' ? 'MAX' : knob.ours}</Text>
          {value !== knob.ours && (
            <TextButton
              label={`Back to ${knob.ours === 'max' ? 'Max' : knob.ours}`}
              color={colors.soft}
              onPress={() => set(knob.ours)}
              edge
            />
          )}
        </View>
      </View>
    </Screen>
  );
}

function Days({
  choices,
  value,
  onChange,
}: {
  choices: readonly number[];
  value: Amount;
  onChange: (n: number) => void;
}) {
  return (
    <Host matchContents={{ vertical: true }}>
      <SingleChoiceSegmentedButtonRow modifiers={[fillMaxWidth()]}>
        {choices.map((days) => (
          <SegmentedButton
            key={days}
            selected={days === value}
            onClick={() => {
              if (days === value) return;
              tick();
              onChange(days);
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
  );
}
