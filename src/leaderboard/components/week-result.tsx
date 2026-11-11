import { useIsFocused } from 'expo-router';
import { Text, useWindowDimensions, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { PrimaryButton } from '@/components/primary-button';
import { GUTTER, Screen } from '@/components/screen';
import { LEAGUES, lastWeekWords, type Board, type League } from '@/leaderboard/leaderboard';
import { capitalise } from '@/lib/text';
import { colors } from '@/theme';

const GAP = 6;
const HEIGHT = [72, 120, 168];
const DOT = 20;
/** The dot rests this far above its step. */
const ABOVE_STEP = 14;

/**
 * The leagues as steps. The amber dot starts on last week's step (a dashed ring stays there) and climbs or
 * drops to this week's: the tab's only motion, because it's the only news. Still when the phone asks for
 * less motion, or when you stayed.
 */
function Stairs({ from, to }: { from: League; to: League }) {
  const still = useReducedMotion();
  // League stays mounted behind Home and reads its board at launch: the climb waits until the tab is in
  // front, the dot held on last week's step meanwhile.
  const focused = useIsFocused();
  const { width } = useWindowDimensions();
  const step = (width - 2 * GUTTER - 2 * GAP) / 3;
  const was = LEAGUES.indexOf(from);
  const is = LEAGUES.indexOf(to);
  const at = (i: number) => ({
    left: i * (step + GAP) + (step - DOT) / 2,
    bottom: HEIGHT[i] + ABOVE_STEP,
  });
  const start = at(was);
  const end = at(is);
  return (
    <View
      accessible
      accessibilityLabel={
        was === is
          ? `You stay in ${capitalise(to)}`
          : `You moved from ${capitalise(from)} to ${capitalise(to)}`
      }
      className="h-54 border-b border-line"
    >
      {LEAGUES.map((league, i) => (
        <View
          key={league}
          className="absolute bottom-0 items-center rounded-t-xl border border-b-0 pt-3"
          style={{
            left: i * (step + GAP),
            width: step,
            height: HEIGHT[i],
            backgroundColor: i === is ? colors.surface : colors.ground,
            borderColor: i === is ? colors.edge : colors.line,
          }}
        >
          <Text
            className="font-mono text-xs tracking-widest"
            style={{ color: i === is ? colors.chalk : colors.faint }}
          >
            {league.toUpperCase()}
          </Text>
        </View>
      ))}
      {was !== is && (
        <View
          className="absolute size-5 rounded-full border border-dashed"
          style={{ ...start, borderColor: colors.faint }}
        />
      )}
      <Animated.View
        className="absolute size-5 rounded-full bg-accent"
        style={[
          end,
          !still &&
            was !== is && {
              animationName: {
                from: {
                  transform: [
                    { translateX: start.left - end.left },
                    { translateY: end.bottom - start.bottom },
                  ],
                },
                to: { transform: [{ translateX: 0 }, { translateY: 0 }] },
              },
              animationDuration: '1.1s',
              animationDelay: '0.4s',
              animationFillMode: 'both',
              animationTimingFunction: 'ease-in-out',
              animationPlayState: focused ? 'running' : 'paused',
            },
        ]}
      />
    </View>
  );
}

/** How last week closed, shown once: the steps, your place, where you are now, and what this week asks. */
export function WeekResult({
  last,
  league,
  onSeen,
}: {
  last: NonNullable<Board['last']>;
  league: League;
  onSeen: () => void;
}) {
  const words = lastWeekWords(league, last);
  return (
    <Screen
      label="LEAGUE · LAST WEEK"
      footer={<PrimaryButton label="See this week's board" onPress={onSeen} />}
    >
      <View className="gap-10 pt-4">
        <Stairs from={last.league} to={league} />
        <View className="gap-3">
          <Text className="font-mono text-xs tracking-widest text-muted">{words.finished}</Text>
          <Text
            accessibilityRole="header"
            maxFontSizeMultiplier={1.3}
            className="font-sans text-5xl font-extralight leading-tight tracking-tighter text-chalk"
          >
            {words.title}
          </Text>
          <Text className="font-sans text-base leading-normal text-soft">{words.text}</Text>
        </View>
      </View>
    </Screen>
  );
}
