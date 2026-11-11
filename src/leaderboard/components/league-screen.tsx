import { useMachine } from '@xstate/react';
import { Text, View } from 'react-native';

import { FAILURE_TEXT } from '@/account/call';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Icon } from '@/components/icon';
import { IconButton } from '@/components/icon-button';
import { Screen } from '@/components/screen';
import { SwitchRow } from '@/components/switch-row';
import { TextButton } from '@/components/text-button';
import { Waiting } from '@/components/waiting';
import { Standings } from '@/leaderboard/components/standings';
import {
  endsIn,
  leaderboard,
  stakes,
  type Problem,
  type TabEvents,
} from '@/leaderboard/leaderboard';
import { capitalise } from '@/lib/text';
import { colors } from '@/theme';

const PROBLEM: Record<Problem, string> = {
  ...FAILURE_TEXT,
  closing: 'The new week is starting. Try again in a minute.',
};

/**
 * This week's league: your place, the board, and whether others see your name. `tab` tells when the tab
 * opens and closes; `onSignIn` hands over to sign-in once the server ended the session.
 */
export function LeagueScreen({ tab, onSignIn }: { tab: TabEvents; onSignIn: () => void }) {
  const [state, send] = useMachine(leaderboard, { input: { tab } });
  const { board, problem, readAt, later, saveFailed, pending } = state.context;
  const reading = state.matches('loading') || state.matches('failing');
  // Signed out, reading again can't help: only signing in can.
  const signIn = <TextButton label="Sign in again" icon="login" onPress={onSignIn} />;

  if (!board) {
    // The first read, and a Try again: later ones keep the last board on screen.
    if (reading || !problem) return <Waiting exercise="jumping-jack" text="Finding your league" />;
    return (
      <Screen label="LEAGUE" title="League">
        <View className="items-start gap-2">
          <Text className="font-sans text-base text-soft">{PROBLEM[problem]}</Text>
          {problem === 'signedOut' ? (
            signIn
          ) : (
            <TextButton label="Try again" icon="refresh" onPress={() => send({ type: 'retry' })} />
          )}
        </View>
      </Screen>
    );
  }

  const you = board.rows.find((row) => row.you);
  const visible = pending ?? board.visible;
  return (
    <Screen
      label="LEAGUE"
      action={
        <IconButton
          icon="refresh"
          label="Refresh"
          size={20}
          edge
          color={reading ? colors.muted : colors.chalk}
          onPress={() => send({ type: 'retry' })}
        />
      }
      title={`${capitalise(board.league)} league`}
      intro={stakes(board)}
    >
      {problem && (
        <View accessibilityLiveRegion="polite" className="items-start gap-1">
          <View className="flex-row items-center gap-2">
            <Icon name="cloud_off" size={18} color={colors.warn} />
            <Text className="flex-1 font-sans text-sm text-chalk">
              {PROBLEM[problem]} This board may be out of date.
            </Text>
          </View>
          {problem === 'signedOut' && signIn}
        </View>
      )}
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
              {endsIn(board.endsAt, readAt)}
            </Text>
          </View>
        </View>
      )}
      <Standings board={board} />
      <View className="gap-3 border-t border-line pt-4">
        <SwitchRow
          label="Show my name"
          note={
            visible
              ? 'Your league sees your name and photo.'
              : 'Your league sees you as Hidden athlete.'
          }
          value={visible === true}
          onChange={(visible) => send({ type: 'show', visible })}
          disabled={!state.matches('shown')}
        />
        {saveFailed && (
          <Text accessibilityLiveRegion="polite" className="font-sans text-sm text-chalk">
            {saveFailed === 'failed' ? "Couldn't save. Try again." : FAILURE_TEXT[saveFailed]}
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
