import { useIsFocused } from 'expo-router';
import { useRef } from 'react';
import { Text, View } from 'react-native';
import { GestureDetector, useTapGesture } from 'react-native-gesture-handler';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { tick } from '@/components/tick';
import { dayAt, dayWords, weeks } from './streak-grid';
import { EARN_EVERY, FREEZES, HOLD, type DayKind, type Streak } from '@/streak/streak';
import { useColors } from '@/components/colors';
import { addDays, dayLabel, type Day } from '@/lib/day';

const STATUS: Record<Streak['status'], string> = {
  atRisk: 'Do any set today to keep it.',
  done: 'Today counts. See you tomorrow.',
  slipped: 'Yesterday slipped. Any set today starts again.',
  start: 'Any set today starts your streak.',
  rest: 'Rest day. Your streak is protected.',
};

const CELL: Record<DayKind, string> = {
  alive: 'bg-accent',
  rest: 'border border-muted',
  frozen: 'border border-soft',
  missed: 'bg-line',
  open: 'border-accent',
  before: 'bg-surface',
  future: '',
};

const PULSE = {
  from: { transform: [{ scale: 1 }], opacity: 0.6 },
  to: { transform: [{ scale: 2.6 }], opacity: 0 },
};

/** The amber dot of a streak still to keep today; it pulses unless the phone asks for less motion. */
function RiskDot() {
  const still = useReducedMotion();
  // Home stays mounted under every other screen: the loop pauses while it is hidden, or it redraws every
  // frame behind them (as the leaderboard's did).
  const focused = useIsFocused();
  return (
    <View className="size-1.5">
      {!still && (
        <Animated.View
          className="absolute inset-0 rounded-full bg-accent"
          style={{
            animationName: PULSE,
            animationDuration: '2.4s',
            animationIterationCount: 'infinite',
            animationTimingFunction: 'ease-out',
            animationPlayState: focused ? 'running' : 'paused',
          }}
        />
      )}
      <View className="absolute inset-0 rounded-full bg-accent" />
    </View>
  );
}

/**
 * 13 weeks, a column per week with Monday on top, labelled where a month starts. Tap a square to pick its
 * day (a ring marks it); TalkBack swipes up or down move the pick a day.
 */
function Grid({
  today,
  kind,
  picked,
  onPick,
}: {
  today: Day;
  kind: Streak['kind'];
  picked: Day;
  onPick: (day: Day) => void;
}) {
  const colors = useColors();
  const columns = weeks(today);
  const month = (week: Day[]) => dayLabel(week[0]).slice(-3);
  const size = useRef({ width: 1, height: 1 });
  const pick = (day: Day | null) => {
    if (!day || day === picked) return;
    tick();
    onPick(day);
  };
  // A tap, not a touch down: a scroll that starts on the grid picks nothing.
  const tap = useTapGesture({
    runOnJS: true,
    onActivate: (e) => pick(dayAt(today, e.x, e.y, size.current.width, size.current.height)),
  });
  return (
    <View className="gap-2">
      <View aria-hidden className="h-4 flex-row gap-0.75">
        {columns.map((week, i) => (
          <View key={week[0]} className="flex-1">
            {i > 0 && month(week) !== month(columns[i - 1]) && (
              // Wider than its week column, so the label spans the next one instead of wrapping.
              <Text className="absolute w-10 font-mono text-xs tracking-widest text-muted">
                {month(week)}
              </Text>
            )}
          </View>
        ))}
      </View>
      <GestureDetector gesture={tap}>
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Last 13 weeks of your streak, a square per day"
          // The legend is hidden from TalkBack, so the value says a trained day too.
          accessibilityValue={{
            text: `${dayWords(picked, kind(picked), today)}${kind(picked) === 'alive' ? ' · DONE' : ''}`,
          }}
          // A double tap with no click action becomes a tap in the grid's middle, picking a day by chance.
          accessibilityActions={[
            { name: 'increment' },
            { name: 'decrement' },
            { name: 'activate' },
          ]}
          onAccessibilityAction={({ nativeEvent: { actionName } }) => {
            if (actionName === 'activate') return;
            const day = addDays(picked, actionName === 'increment' ? 1 : -1);
            if (day >= columns[0][0] && day <= today) pick(day);
          }}
          onLayout={({ nativeEvent: { layout } }) => {
            size.current = { width: layout.width, height: layout.height };
          }}
          className="flex-row gap-0.75"
        >
          {columns.map((week) => (
            <View key={week[0]} className="flex-1 gap-0.75">
              {week.map((day) => (
                <View
                  key={day}
                  className={`aspect-square items-center justify-center rounded ${CELL[kind(day)]}`}
                  style={{
                    // The design's 1.5px ring for today, between the 1px and 2px classes.
                    borderWidth: kind(day) === 'open' ? 1.5 : undefined,
                    // The picked day: a chalk ring outside the square, in the gap, so today's still shows.
                    outlineWidth: day === picked ? 1.5 : 0,
                    outlineColor: colors.chalk,
                    outlineStyle: 'solid',
                  }}
                >
                  {kind(day) === 'rest' && <View className="h-px w-1.5 bg-muted" />}
                  {kind(day) === 'frozen' && <Icon name="ac_unit" size={12} color={colors.soft} />}
                </View>
              ))}
            </View>
          ))}
        </View>
      </GestureDetector>
      <View aria-hidden className="mt-1 flex-row gap-4">
        {(
          [
            ['DONE', 'bg-accent'],
            ['REST', 'border border-muted'],
            ['FROZEN', 'border border-soft'],
            ['MISSED', 'bg-line'],
          ] as const
        )
          // No day can be frozen while freezes are off.
          .filter(([label]) => FREEZES || label !== 'FROZEN')
          .map(([label, cell]) => (
            <View key={label} className="flex-row items-center gap-1.5">
              <View className={`size-2.5 rounded-sm ${cell}`} />
              <Text className="font-mono text-xs tracking-widest text-muted">{label}</Text>
            </View>
          ))}
      </View>
    </View>
  );
}

/** Today's streak: days in a row, how today stands, the grid to pick a day on, and the freezes held. */
export function StreakPanel({
  streak,
  today,
  picked,
  onPick,
}: {
  streak: Streak;
  today: Day;
  picked: Day;
  onPick: (day: Day) => void;
}) {
  const colors = useColors();
  const { current, best, trained, held, toNext, status, kind } = streak;
  const hint =
    toNext === null
      ? 'Both held'
      : !trained
        ? `${EARN_EVERY} days in a row earns one`
        : `${toNext} more ${toNext === 1 ? 'day' : 'days'} earns one`;
  return (
    <View className="gap-6">
      <View className="gap-2">
        <View
          accessible
          accessibilityLabel={`${current} ${current === 1 ? 'day' : 'days'} in your streak${best > current ? `, best ${best}` : ''}`}
          className="flex-row items-baseline gap-3"
        >
          <Text
            maxFontSizeMultiplier={1}
            className={`font-sans text-6xl font-thin leading-none tracking-tighter ${
              status === 'done' ? 'text-mark' : current > 0 ? 'text-chalk' : 'text-faint'
            }`}
          >
            {current}
          </Text>
          <Text className="font-mono text-xs tracking-widest text-muted">
            DAY STREAK
            {best > current ? ` · BEST ${best}` : ''}
          </Text>
        </View>
        <View className="mt-2 flex-row items-center gap-2.5">
          {status === 'atRisk' && <RiskDot />}
          <Text className="shrink font-sans text-base text-soft">
            {status === 'rest' && current === 0
              ? 'Rest day. Your next workout starts your streak.'
              : STATUS[status]}
          </Text>
        </View>
      </View>

      <Grid today={today} kind={kind} picked={picked} onPick={onPick} />

      {FREEZES && (
        <View className="h-14 flex-row items-center justify-between border-t border-line">
          <Text className="font-mono text-xs tracking-widest text-muted">FREEZES</Text>
          <View className="flex-row items-center gap-3">
            <Text className="font-sans text-sm text-muted">{hint}</Text>
            <View
              accessible
              accessibilityRole="image"
              accessibilityLabel={`${held} of ${HOLD} freezes held`}
              className="flex-row gap-1"
            >
              {Array.from({ length: HOLD }, (_, i) => (
                <Icon
                  key={i}
                  name="ac_unit"
                  size={20}
                  color={i < held ? colors.chalk : colors.edge}
                />
              ))}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
