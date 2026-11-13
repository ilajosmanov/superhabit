import { useState, type ReactNode } from 'react';
import { Text, TextInput, View } from 'react-native';

import { useColors } from './colors';
import { canSendFeedback, sendFeedback, type FeedbackDraft } from './feedback';
import { Icon } from './icon';
import { PrimaryButton } from './primary-button';
import { useSnackbar } from './snackbar';
import { Sheet } from './sheet';
import { TextButton } from './text-button';

/**
 * The feedback form every way in shares: its words, any questions of the caller's (`children`), one text
 * field and Send. It owns what you typed, which survives dismissal until sent, and whether the last send
 * failed; the caller owns its button, whether the sheet is open, and its own answers (`draft` adds them).
 */
export function FeedbackSheet({
  open,
  onClose,
  words,
  optional = false,
  note,
  draft,
  onSent,
  children,
}: {
  open: boolean;
  onClose: () => void;
  words: { kicker: string; title: string; lede?: string; placeholder: string };
  /** The text is an extra after the caller's questions, not the answer itself. */
  optional?: boolean;
  /** Under the field: what goes with the message. */
  note?: string;
  /** What Send sends, from what was typed. */
  draft: (message: string) => FeedbackDraft;
  /** Sent: clear the caller's own answers. The sheet has closed and thanked already. */
  onSent?: () => void;
  children?: ReactNode;
}) {
  const colors = useColors();
  const notify = useSnackbar();
  const [message, setMessage] = useState('');
  const [focused, setFocused] = useState(false);
  // The last send failed: the draft stays and Send reads Try again.
  const [failed, setFailed] = useState(false);
  const current = draft(message);
  // Closing unmounts the field before its blur arrives, so focus is cleared here.
  const close = () => {
    setFocused(false);
    onClose();
  };
  const send = () => {
    if (!sendFeedback(current)) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setMessage('');
    close();
    onSent?.();
    notify?.('Thanks, feedback sent');
  };
  return (
    <Sheet
      open={open}
      onDismiss={close}
      // Pinned while typing, so the keyboard can't cover Send.
      pinFooter={focused}
      footer={
        <View className="flex-row items-center gap-3">
          <TextButton label="Not now" onPress={close} color={colors.muted} />
          <View className="flex-1">
            <PrimaryButton
              label={failed ? 'Try again' : 'Send'}
              accessibilityLabel={failed ? 'Try sending again' : 'Send feedback'}
              disabled={!canSendFeedback(current)}
              onPress={send}
            />
          </View>
        </View>
      }
    >
      <View className="gap-2.5">
        <Text className="font-mono text-xs tracking-widest text-muted">{words.kicker}</Text>
        <Text
          accessibilityRole="header"
          className="font-sans text-3xl font-light leading-tight tracking-tight text-chalk"
        >
          {words.title}
        </Text>
        {words.lede && (
          <Text className="font-sans text-base leading-normal text-soft">{words.lede}</Text>
        )}
      </View>

      {children}

      <View className={optional ? 'gap-3' : 'gap-2.5'}>
        {optional && (
          <View className="flex-row justify-between">
            <Text className="font-mono text-xs tracking-widest text-muted">ANYTHING ELSE</Text>
            <Text className="font-mono text-xs tracking-widest text-subtle">OPTIONAL</Text>
          </View>
        )}
        {/* A well one tone below the sheet, no outline; a ring while you type. */}
        <TextInput
          accessibilityLabel={optional ? 'Anything else? Optional' : 'Your feedback'}
          value={message}
          onChangeText={setMessage}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          multiline
          maxLength={1000}
          cursorColor={colors.mark}
          selectionColor={colors.line}
          selectionHandleColor={colors.mark}
          placeholder={words.placeholder}
          placeholderTextColor={colors.faint}
          textAlignVertical="top"
          className={`${optional ? 'h-22' : 'h-28'} rounded-2xl bg-ground font-sans text-base text-chalk`}
          // Padding as style: Android's own TextInput padding wins over the class.
          style={{
            borderWidth: 1.5,
            borderColor: focused ? colors.mark : 'transparent',
            paddingHorizontal: 16,
            paddingVertical: 14,
          }}
        />
        {note && (
          <View className="flex-row items-center gap-2">
            <Icon name="smartphone" size={16} color={colors.muted} />
            <Text className="flex-1 font-sans text-sm text-muted">{note}</Text>
          </View>
        )}
      </View>

      {failed && (
        <View accessibilityLiveRegion="polite" className="flex-row items-center gap-2.5">
          <Icon name="error" size={20} color={colors.warn} />
          <Text className="flex-1 font-sans text-sm text-chalk">
            Couldn’t send. {optional ? 'Your answers are' : 'What you wrote is'} still here.
          </Text>
        </View>
      )}
    </Sheet>
  );
}
