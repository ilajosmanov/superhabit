import { useMachine } from '@xstate/react';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Avatar } from '@/account/components/avatar';
import { me } from '@/account/me';
import { useLeave } from '@/bootstrap/leave';
import { useLibrary } from '@/challenges/library-live';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { SwitchRow } from '@/components/switch-row';
import { TextButton } from '@/components/text-button';
import { colors } from '@/theme';

const WHY = {
  offline: 'No internet. It needs it.',
  failed: "Couldn't reach Superhabit. Try again.",
};

/** Your profile (board 23): your Google name and photo, sharing your reps, Sign out, Delete account. */
export default function MeScreen() {
  const { account } = useLibrary();
  const leave = useLeave();
  const [state, send] = useMachine(me.provide({ actions: { deleted: leave.deleted } }));
  const [asking, setAsking] = useState<'signOut' | 'delete' | null>(null);
  const { sharing, error } = state.context;
  const deleting = state.matches('deleting') || state.matches('deleted');
  const why = (about: 'sharing' | 'deleting') =>
    error?.about === about && error.why ? WHY[error.why] : null;
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
      <View className="gap-3 border-t border-line pt-4">
        <SwitchRow
          label="Train the coach"
          note={
            sharing
              ? 'The points of your reps help it see form better.'
              : 'Your reps stay on this phone.'
          }
          value={sharing}
          onChange={(on) => send({ type: 'share', on })}
          disabled={!state.matches('idle')}
        />
        {why('sharing') && <Problem text={why('sharing') ?? ''} />}
      </View>
      <View className="items-start border-t border-line pt-2">
        <TextButton label="Sign out" icon="logout" onPress={() => setAsking('signOut')} />
        <TextButton
          label="Delete account"
          icon="delete"
          color={colors.warn}
          onPress={() => setAsking('delete')}
        />
      </View>
      {asking === 'signOut' && (
        <ConfirmDialog
          title="Sign out?"
          text="Your workouts stay on this phone. If another account signs in here, they're replaced."
          action="Sign out"
          warn={false}
          onConfirm={() => {
            setAsking(null);
            leave.signOut();
          }}
          onCancel={() => setAsking(null)}
        />
      )}
      {asking === 'delete' && (
        <ConfirmDialog
          title="Delete your account?"
          text={[
            "Your workouts, challenges and videos go from this phone, and everything we hold about you goes from our server. It can't be undone.",
            why('deleting'),
          ]
            .filter(Boolean)
            .join('\n\n')}
          action={deleting ? 'Deleting…' : 'Delete'}
          cancel="Keep it"
          onConfirm={() => send({ type: 'delete' })}
          // Once Delete is sent the server may already have it: the dialog stays until it answers.
          onCancel={() => !deleting && setAsking(null)}
        />
      )}
    </Screen>
  );
}

function Problem({ text }: { text: string }) {
  return (
    <View accessibilityLiveRegion="polite" className="flex-row items-center gap-2">
      <Icon name="error" size={18} color={colors.warn} />
      <Text className="font-sans text-sm text-chalk">{text}</Text>
    </View>
  );
}
