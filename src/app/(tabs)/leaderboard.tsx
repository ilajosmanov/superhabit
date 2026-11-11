import { useMachine } from '@xstate/react';
import { useNavigation } from 'expo-router';
import { Text, View } from 'react-native';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { Screen } from '@/components/screen';
import { SwitchRow } from '@/components/switch-row';
import { TextButton } from '@/components/text-button';
import { Waiting } from '@/components/waiting';
import { Standings } from '@/leaderboard/components/standings';
import { leaderboard, type Board, type League } from '@/leaderboard/leaderboard';
import { capitalise } from '@/lib/text';

const ABOVE: Record<League, League | null> = { bronze: 'silver', silver: 'gold', gold: null };
const BELOW: Record<League, League | null> = { bronze: null, silver: 'bronze', gold: 'silver' };

const PROBLEM = {
  offline: 'No internet. Connect to see your league.',
  failed: "Couldn't reach Superhabit. Try again.",
  closing: 'The new week is starting. Try again in a minute.',
};

/** What this week is for: who moves where when it closes. */
function stakes({ league, up, down }: Board) {
  const above = ABOVE[league];
  const below = BELOW[league];
  if (up === 0 && down === 0) {
    return above
      ? 'Every counted rep and second scores. Moving up starts once three people with points share your board.'
      : 'Every counted rep and second scores. Stay near the top to keep your place in Gold.';
  }
  return [
    up > 0 && above && `The top ${up} move up to ${capitalise(above)}.`,
    down > 0 && below && `The bottom ${down} drop to ${capitalise(below)}.`,
    !above && 'Stay near the top to keep your place in Gold.',
  ]
    .filter(Boolean)
    .join(' ');
}

const HOUR = 60 * 60 * 1000;
/** How long the week has left, in days, or hours on its last day (it ends at a fixed moment, not your midnight). */
const endsIn = (endsAt: number) => {
  const hours = Math.max(1, Math.ceil((endsAt - Date.now()) / HOUR));
  if (hours < 24) return `ENDS IN ${hours} ${hours === 1 ? 'HOUR' : 'HOURS'}`;
  const days = Math.ceil(hours / 24);
  return `ENDS IN ${days} DAYS`;
};

/** This week's league: your place, the board, and whether others see your name. */
export default function LeaderboardScreen() {
  const navigation = useNavigation();
  const [state, send] = useMachine(leaderboard, {
    input: { onFocus: (listener) => navigation.addListener('focus', listener) },
  });
  const { board, problem, later, saveFailed } = state.context;

  // The first read only: later ones keep the last board on screen.
  if (!board && !problem) return <Waiting exercise="jumping-jack" text="Finding your league" />;
  if (!board) {
    return (
      <Screen label="LEAGUE" title="League">
        <View className="items-start gap-2">
          <Text className="font-sans text-base text-soft">{problem && PROBLEM[problem]}</Text>
          <TextButton label="Try again" icon="refresh" onPress={() => send({ type: 'retry' })} />
        </View>
      </Screen>
    );
  }

  const you = board.rows.find((row) => row.you);
  return (
    <Screen label="LEAGUE" title={`${capitalise(board.league)} league`} intro={stakes(board)}>
      {you && (
        <View accessible className="flex-row items-end gap-4">
          <Text className="font-sans text-9xl font-thin leading-none tracking-tighter text-chalk">
            {you.rank}
          </Text>
          <View className="gap-1 pb-4">
            <Text className="font-mono text-xs tracking-widest text-muted">
              OF {board.rows.length} · {you.points} POINTS
            </Text>
            <Text className="font-mono text-xs tracking-widest text-muted">
              {endsIn(board.endsAt)}
            </Text>
          </View>
        </View>
      )}
      <Standings board={board} />
      <View className="gap-3 border-t border-line pt-4">
        <SwitchRow
          label="Show my name"
          note={
            board.visible
              ? 'Your league sees your name and photo.'
              : 'Your league sees you as Hidden athlete.'
          }
          value={board.visible === true}
          onChange={(visible) => send({ type: 'show', visible })}
          disabled={!state.matches('shown')}
        />
        {saveFailed && (
          <Text accessibilityLiveRegion="polite" className="font-sans text-sm text-chalk">
            {saveFailed === 'offline' ? 'No internet. It needs it.' : "Couldn't save. Try again."}
          </Text>
        )}
      </View>
      {state.matches('shown') && board.visible === null && !later && (
        <ConfirmDialog
          title="Show your name?"
          text="Your league sees your name and photo next to your points. Hidden, you still compete and see your place."
          action="Show me"
          cancel="Stay hidden"
          warn={false}
          onConfirm={() => send({ type: 'show', visible: true })}
          onCancel={() => send({ type: 'show', visible: false })}
          onDismiss={() => send({ type: 'later' })}
        />
      )}
    </Screen>
  );
}
