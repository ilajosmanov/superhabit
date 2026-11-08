import {
  AlertDialog,
  Host,
  Text as ComposeText,
  TextButton as ComposeTextButton,
} from '@expo/ui/jetpack-compose';
import { useRouter } from 'expo-router';
import { useState } from 'react';

import { leave } from '@/challenges/mine';
import { IconButton } from '@/components/icon-button';
import { saveFailed } from './save-failed';
import { colors } from '@/theme';

const FONT = { fontFamily: 'Geist', fontWeight: '500', fontSize: 15 } as const;

/**
 * Leaves the challenge you are in, `id`. That deletes the run's days, so it asks first, in the
 * platform's dialog.
 */
export function LeaveButton({ id }: { id: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const onLeave = () => {
    // To the tabs first: a challenge you made has no page to come back to once gone. A failed delete
    // says so there, where the challenge still shows.
    router.dismissAll();
    if (!leave(id)) saveFailed();
  };
  return (
    <>
      {/* A disc as tall as the button beside it, red like the dialog's Leave. */}
      <IconButton
        icon="delete"
        label="Leave challenge"
        color={colors.warn}
        fill={colors.line}
        diameter={60}
        onPress={() => setAsking(true)}
      />
      {asking && (
        // Out of the footer row's flow: the dialog draws in its own window, but its host would take a slot.
        <Host matchContents style={{ position: 'absolute' }}>
          <AlertDialog
            onDismissRequest={() => setAsking(false)}
            colors={{
              containerColor: colors.surface,
              titleContentColor: colors.chalk,
              textContentColor: colors.soft,
            }}
          >
            <AlertDialog.Title>
              <ComposeText style={{ fontFamily: 'Geist', fontSize: 22 }}>
                Leave this challenge?
              </ComposeText>
            </AlertDialog.Title>
            <AlertDialog.Text>
              <ComposeText style={{ fontFamily: 'Geist', fontSize: 15 }}>
                Its days so far are deleted.
              </ComposeText>
            </AlertDialog.Text>
            <AlertDialog.ConfirmButton>
              <ComposeTextButton onClick={onLeave}>
                <ComposeText color={colors.warn} style={FONT}>
                  Leave
                </ComposeText>
              </ComposeTextButton>
            </AlertDialog.ConfirmButton>
            <AlertDialog.DismissButton>
              <ComposeTextButton onClick={() => setAsking(false)}>
                <ComposeText color={colors.chalk} style={FONT}>
                  Cancel
                </ComposeText>
              </ComposeTextButton>
            </AlertDialog.DismissButton>
          </AlertDialog>
        </Host>
      )}
    </>
  );
}
