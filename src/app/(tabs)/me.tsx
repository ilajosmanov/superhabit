import { useState } from 'react';
import { Text, View } from 'react-native';

import { Avatar } from '@/account/components/avatar';
import { useSignOut } from '@/bootstrap/sign-out';
import { useLibrary } from '@/challenges/library-live';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Screen } from '@/components/screen';
import { TextButton } from '@/components/text-button';

export default function MeScreen() {
  const { account } = useLibrary();
  const signOut = useSignOut();
  const [asking, setAsking] = useState(false);
  return (
    <Screen label="SUPERHABIT" title="Me">
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
      <View className="items-start border-t border-line pt-2">
        <TextButton label="Sign out" icon="logout" onPress={() => setAsking(true)} />
      </View>
      {asking && (
        <ConfirmDialog
          title="Sign out?"
          text="Your workouts stay on this phone. If another account signs in here, they're replaced."
          action="Sign out"
          warn={false}
          onConfirm={() => {
            setAsking(false);
            signOut();
          }}
          onCancel={() => setAsking(false)}
        />
      )}
    </Screen>
  );
}
