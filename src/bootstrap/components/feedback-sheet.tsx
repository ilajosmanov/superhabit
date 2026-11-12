import * as Sentry from '@sentry/react-native';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { Sheet } from '@/components/sheet';
import { TextButton } from '@/components/text-button';
import { colors } from '@/theme';

/**
 * The crash screen's Send feedback: a sheet with one field. What you write goes to Sentry with the crash it
 * follows (the last event sent), so it reads beside the stack trace. Only the text goes: no name, no email.
 */
export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const send = () => {
    Sentry.captureFeedback({ message: message.trim(), associatedEventId: Sentry.lastEventId() });
    setSent(true);
    setOpen(false);
  };
  return (
    <>
      <TextButton
        wide
        label={sent ? 'Thanks, sent' : 'Send feedback'}
        disabled={sent}
        onPress={() => setOpen(true)}
      />
      <Sheet open={open} onDismiss={() => setOpen(false)}>
        <View className="gap-2">
          <Text className="font-mono text-xs tracking-widest text-muted">SEND FEEDBACK</Text>
          <Text
            accessibilityRole="header"
            className="font-sans text-3xl font-light tracking-tight text-chalk"
          >
            What were you doing?
          </Text>
          <Text className="font-sans text-base leading-normal text-soft">
            It goes with the error report, so we can find what broke.
          </Text>
        </View>
        <TextInput
          accessibilityLabel="Your feedback"
          value={message}
          onChangeText={setMessage}
          multiline
          maxLength={1000}
          autoFocus
          cursorColor={colors.accent}
          selectionColor={colors.line}
          selectionHandleColor={colors.accent}
          placeholder="I tapped…"
          placeholderTextColor={colors.faint}
          textAlignVertical="top"
          // A fixed height: an empty multiline field on Android otherwise grows by the font's metrics.
          className="h-32 rounded-lg border border-line p-3 font-sans text-base text-chalk"
        />
        <PrimaryButton label="Send" disabled={message.trim() === ''} onPress={send} />
      </Sheet>
    </>
  );
}
