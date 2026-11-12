import { useMachine } from '@xstate/react';
import { useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { FAILURE_TEXT } from '@/account/call';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Icon } from '@/components/icon';
import { IconButton } from '@/components/icon-button';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { SwitchRow } from '@/components/switch-row';
import { TextButton } from '@/components/text-button';
import { Waiting } from '@/components/waiting';
import { PointsSheet } from '@/leaderboard/components/points-sheet';
import { Standings } from '@/leaderboard/components/standings';
import { WeekResult } from '@/leaderboard/components/week-result';
import { YourPlace } from '@/leaderboard/components/your-place';
import {
  asksVisibility,
  bonusOf,
  leaderboard,
  unseenClose,
  type Problem,
  type TabEvents,
} from '@/leaderboard/leaderboard';
import { useColors } from '@/components/colors';

const PROBLEM: Record<Problem, string> = {
  ...FAILURE_TEXT,
  closing: 'The new week is starting. Try again in a minute.',
};

/**
 * This week's league: how last week closed (once), then your place, the board, and whether others see
 * your name. `tab` tells when the tab opens and closes; `onSignIn` hands over to sign-in once the server
 * ended the session; `streak` is the days in a row your next set makes; `onScore` opens a random set, and
 * `children` is where its sheet goes.
 */
export function LeagueScreen({
  tab,
  onSignIn,
  streak,
  onScore,
  children,
}: {
  tab: TabEvents;
  onSignIn: () => void;
  streak: number;
  onScore: () => void;
  children?: ReactNode;
}) {
  const colors = useColors();
  const [state, send] = useMachine(leaderboard, { input: { tab } });
  const { board, problem, readAt, saveFailed, pending, seen, pulled } = state.context;
  const [explained, setExplained] = useState(false);
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

  const last = unseenClose(board, seen);
  if (last) {
    return <WeekResult last={last} league={board.league} onSeen={() => send({ type: 'seen' })} />;
  }

  const you = board.rows.find((row) => row.you);
  const visible = pending ?? board.visible;
  const bonus = bonusOf(board.bonus, streak);
  return (
    <Screen
      label="LEAGUE"
      action={
        <IconButton
          icon="help"
          label="How points count"
          size={20}
          edge
          onPress={() => setExplained(true)}
        />
      }
      refresh={{ refreshing: pulled, onRefresh: () => send({ type: 'retry' }) }}
      footer={
        you?.points === 0 &&
        board.endsAt > readAt && <PrimaryButton label="Score your first points" onPress={onScore} />
      }
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
      <YourPlace board={board} readAt={readAt} bonus={bonus} streak={streak} />
      <Standings board={board} hidden={visible !== true} />
      <View className="-mt-4 gap-3">
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
      {asksVisibility(state) && (
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
      <PointsSheet
        open={explained}
        board={board}
        bonus={bonus}
        onDismiss={() => setExplained(false)}
      />
      {children}
    </Screen>
  );
}
