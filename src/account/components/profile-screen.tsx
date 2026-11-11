import { useMachine } from '@xstate/react';
import { Text, View } from 'react-native';

import { FAILURE_TEXT } from '@/account/call';
import { openPrivacyPolicy, SHARING_FACTS } from '@/account/components/consent-screen';
import { me, notSent, refusedText, sharingShown } from '@/account/me';
import { Avatar } from '@/components/avatar';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { SwitchRow } from '@/components/switch-row';
import { TextButton } from '@/components/text-button';
import type { Account } from '@/storage/account';
import type { Sharing } from '@/storage/consent';
import { colors } from '@/theme';

/**
 * Your profile (board 23): your Google name and photo, sharing your reps, Sign out, Delete account. The
 * route hands over to startup: `leave` signs out, after a deletion, or signs in again once the server
 * ended the session.
 */
export function ProfileScreen({
  account,
  sharing: kept,
  leave,
}: {
  account: Account;
  /** Your answer to sharing, as this phone keeps it (the shared snapshot's). */
  sharing: Sharing | null;
  leave: { signOut: () => void; deleted: () => void; sessionEnded: () => void };
}) {
  const [state, send] = useMachine(
    me.provide({ actions: { deleted: leave.deleted, signedOut: leave.signOut } }),
  );
  const { error, refused, unsent } = state.context;
  const sharing = sharingShown(state, kept);
  const ended = state.matches('ended');
  return (
    <Screen label="SUPERHABIT" title="Profile">
      <View className="flex-row items-center gap-4">
        <Avatar name={account.name} image={account.image} />
        <View className="flex-1 gap-1">
          <Text numberOfLines={1} className="font-sans text-2xl font-light text-chalk">
            {account.name}
          </Text>
          <Text className="font-mono text-xs tracking-widest text-muted">
            SIGNED IN WITH GOOGLE
          </Text>
        </View>
      </View>
      {ended && (
        <View className="items-start gap-2">
          <Problem text={FAILURE_TEXT.signedOut} />
          <TextButton label="Sign in again" icon="login" onPress={leave.sessionEnded} />
        </View>
      )}
      <View className="gap-3 border-t border-line pt-4">
        <SwitchRow
          label="Train the coach"
          note={
            sharing
              ? 'The points of your reps help it see form better.'
              : 'Your videos stay on this phone.'
          }
          value={sharing}
          onChange={(on) => send({ type: 'share', on })}
          disabled={!state.matches('idle')}
        />
        {state.matches('idle') && error && <Problem text={FAILURE_TEXT[error]} />}
      </View>
      <View className="items-start border-t border-line pt-2">
        <TextButton label="Privacy policy" icon="policy" onPress={openPrivacyPolicy} />
        {/* One call at a time: while the switch's call runs, these wait too. */}
        <TextButton
          label="Sign out"
          icon="logout"
          disabled={!state.matches('idle')}
          onPress={() => send({ type: 'askSignOut' })}
        />
        <TextButton
          label="Delete account"
          icon="delete"
          color={colors.warn}
          disabled={!state.matches('idle')}
          onPress={() => send({ type: 'askDelete' })}
        />
      </View>
      {state.matches('confirming') && (
        <ConfirmDialog
          title="Train the coach?"
          text={SHARING_FACTS.map(({ title, text }) => `${title}: ${text}`).join('\n\n')}
          action="Count me in"
          warn={false}
          onConfirm={() => send({ type: 'agree' })}
          onCancel={() => send({ type: 'cancel' })}
        />
      )}
      {/* The dialog stays while a call runs: the server may already have it. Its buttons are off then. */}
      {state.matches('signingOut') && (
        <ConfirmDialog
          title="Sign out?"
          text={
            refused > 0
              ? refusedText(refused)
              : error
                ? notSent(FAILURE_TEXT[error], unsent)
                : 'Your workouts are saved to your account, ready when you sign in again.'
          }
          action={
            !state.can({ type: 'signOut' })
              ? 'Signing out…'
              : refused > 0
                ? 'Sign out anyway'
                : 'Sign out'
          }
          warn={refused > 0}
          disabled={!state.can({ type: 'signOut' })}
          onConfirm={() => send({ type: 'signOut' })}
          onCancel={() => send({ type: 'cancel' })}
        />
      )}
      {state.matches('deleting') && (
        <ConfirmDialog
          title="Delete your account?"
          text={[
            "Your workouts, challenges and videos go from this phone, and everything we hold about you goes from our server. It can't be undone.",
            error && FAILURE_TEXT[error],
          ]
            .filter(Boolean)
            .join('\n\n')}
          action={state.can({ type: 'delete' }) ? 'Delete' : 'Deleting…'}
          cancel="Keep it"
          disabled={!state.can({ type: 'delete' })}
          onConfirm={() => send({ type: 'delete' })}
          onCancel={() => send({ type: 'cancel' })}
        />
      )}
    </Screen>
  );
}

function Problem({ text }: { text: string }) {
  return (
    <View accessibilityLiveRegion="polite" className="flex-row items-center gap-2">
      <Icon name="error" size={18} color={colors.warn} />
      <Text className="flex-1 font-sans text-sm text-chalk">{text}</Text>
    </View>
  );
}
