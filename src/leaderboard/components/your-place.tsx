import { Text, View } from 'react-native';

import {
  ABOVE,
  BELOW,
  endsIn,
  LEAGUES,
  scored,
  standing,
  weekDay,
  weekLetters,
  closesAt,
  type Board,
  type League,
} from '@/leaderboard/leaderboard';
import { capitalise } from '@/lib/text';
import { useColors } from '@/components/colors';

/** The three leagues as steps, yours lit: where you stand on the ladder. */
function Steps({ league }: { league: League }) {
  const colors = useColors();
  const at = LEAGUES.indexOf(league);
  return (
    <View
      accessible
      accessibilityLabel={`${capitalise(league)}: league ${at + 1} of 3`}
      className="h-5 flex-row items-end gap-0.5"
    >
      {LEAGUES.map((step, i) => (
        <View
          key={step}
          className="w-1.5 rounded-sm"
          style={{ height: 8 + i * 6, backgroundColor: i === at ? colors.chalk : colors.line }}
        />
      ))}
    </View>
  );
}

/** Monday to Sunday, today outlined; the time left beside it, chalk on the last day. */
function Week({ endsAt, readAt }: { endsAt: number; readAt: number }) {
  const colors = useColors();
  const today = weekDay(endsAt, readAt);
  const left = endsIn(endsAt, readAt);
  return (
    <View className="gap-2 pb-4">
      <View className="flex-row flex-wrap items-baseline justify-between gap-x-4">
        <Text className="font-mono text-xs tracking-widest text-muted">THIS WEEK</Text>
        <Text
          className="font-mono text-xs tracking-widest"
          style={{ color: today === 6 ? colors.chalk : colors.muted }}
        >
          {left}
        </Text>
      </View>
      <View
        accessible
        accessibilityLabel={`Day ${today + 1} of 7. ${left.toLowerCase()}`}
        className="flex-row gap-1"
      >
        {weekLetters(endsAt).map((letter, i) => (
          <View key={i} className="flex-1 items-center gap-1.5">
            <View
              className="h-1.5 self-stretch rounded-full"
              style={
                i < today
                  ? { backgroundColor: colors.edge }
                  : {
                      borderWidth: i === today ? 1.5 : 1,
                      borderColor: i === today ? colors.chalk : colors.line,
                    }
              }
            />
            <Text
              className="font-mono text-xs"
              style={{ color: i === today ? colors.chalk : colors.faint }}
            >
              {letter}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** The week's rules, said once: the first time you see a board, before anyone has points. */
function Rules({ league, endsAt }: { league: League; endsAt: number }) {
  const above = ABOVE[league];
  const below = BELOW[league];
  // The server's COHORT and MOVE (server/src/leagues/store.ts): change them together.
  const rules = [
    ['ONE WEEK', `Seven days. This one closes ${closesAt(endsAt)}.`],
    ['YOUR BOARD', `Up to 30 people, all in ${capitalise(league)}.`],
    [
      'MOVING',
      [
        above
          ? `The top third with points, 5 at most, move up to ${capitalise(above)}.`
          : 'Gold is the top league.',
        below
          ? `The bottom third, 5 at most, drop to ${capitalise(below)}.`
          : 'Nobody drops from Bronze.',
      ].join(' '),
    ],
  ];
  return (
    <View className="border-t border-line">
      {rules.map(([term, meaning]) => (
        <View
          key={term}
          accessible
          className="min-h-13 flex-row items-center gap-4 border-b border-line py-2"
        >
          <Text className="w-24 font-mono text-xs tracking-widest text-muted">{term}</Text>
          <Text className="flex-1 font-sans text-sm leading-snug text-soft">{meaning}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Your place (or your 0 before you score), the league's steps, the one gap worth acting on, the week, and
 * the streak bonus your next set earns.
 */
export function YourPlace({
  board,
  readAt,
  bonus,
  streak,
}: {
  board: Board;
  readAt: number;
  /** In whole percent. */
  bonus: number;
  /** Days in a row your next set makes. */
  streak: number;
}) {
  const colors = useColors();
  const you = board.rows.find((row) => row.you);
  const counted = you !== undefined && you.points > 0;
  const n = board.rows.length;
  return (
    <>
      <View className="gap-4">
        <View accessible className="flex-row items-end gap-4">
          <Text
            maxFontSizeMultiplier={1}
            className="font-sans text-9xl font-thin leading-none tracking-tighter"
            style={{ color: counted ? colors.chalk : colors.faint }}
          >
            {counted ? you.rank : 0}
          </Text>
          <View className="flex-1 gap-1.5 pb-3">
            <Steps league={board.league} />
            <Text className="font-mono text-xs tracking-widest text-chalk">
              {board.league.toUpperCase()} LEAGUE
            </Text>
            <Text className="font-mono text-xs tracking-widest text-muted">
              {counted ? `OF ${n} · ${you.points} POINTS` : `POINTS · ${n} ON YOUR BOARD`}
            </Text>
          </View>
        </View>
        <Text accessibilityLiveRegion="polite" className="font-sans text-lg font-light text-chalk">
          {standing(board)}
        </Text>
      </View>

      {!scored(board) && !board.last && <Rules league={board.league} endsAt={board.endsAt} />}

      <View>
        <Week endsAt={board.endsAt} readAt={readAt} />
        {bonus > 0 && (
          <View
            accessible
            accessibilityLabel={`Streak bonus: plus ${bonus} percent, ${streak} streak days`}
            className="h-14 flex-row items-center justify-between border-y border-line"
          >
            <Text className="font-mono text-xs tracking-widest text-muted">STREAK BONUS</Text>
            <View className="flex-row items-baseline gap-2.5">
              <Text className="font-mono text-xs tracking-widest text-muted">{streak} DAYS</Text>
              <Text className="font-sans text-xl font-light text-chalk">+{bonus}%</Text>
            </View>
          </View>
        )}
      </View>
    </>
  );
}
