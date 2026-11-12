import type { AndroidSymbol } from 'expo-symbols';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { useColors } from './colors';
import {
  canSendFeedback,
  REACTIONS,
  sendFeedback,
  type FeedbackSource,
  type Reaction,
} from './feedback';
import { IconButton } from './icon-button';
import { PrimaryButton } from './primary-button';
import { Segments } from './segments';
import { Sheet } from './sheet';
import { TextButton } from './text-button';
import { tick } from './tick';

const FACES: Record<Reaction, AndroidSymbol> = {
  Bad: 'sentiment_dissatisfied',
  Okay: 'sentiment_neutral',
  Good: 'sentiment_satisfied',
};

/** A dismissible check-in, or the same form opened on purpose. Drafts survive dismissal until sent. */
export function FeedbackButton({
  source,
  initiallyOpen = false,
  measure = 'reps',
  details,
}: {
  source: FeedbackSource;
  initiallyOpen?: boolean;
  measure?: 'reps' | 'seconds' | 'mixed';
  details?: Record<string, string>;
}) {
  const colors = useColors();
  const [open, setOpen] = useState(initiallyOpen);
  const [message, setMessage] = useState('');
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const [accuracy, setAccuracy] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState(false);
  const workout = source === 'workout';
  const crash = source === 'crash';
  const expanded = !workout || reaction !== null;
  const draft = { source, message, reaction, accuracy, details };
  const close = () => setOpen(false);
  const send = () => {
    if (!sendFeedback(draft)) {
      setFailed(true);
      return;
    }
    setSent(true);
    setFailed(false);
    setMessage('');
    setReaction(null);
    setAccuracy(null);
    close();
  };
  const less =
    measure === 'reps' ? 'Missed reps' : measure === 'seconds' ? 'Too short' : 'Too little';
  const more =
    measure === 'reps' ? 'Counted extra' : measure === 'seconds' ? 'Too long' : 'Too much';

  return (
    <>
      <TextButton
        wide={crash}
        icon={crash ? undefined : 'chat_bubble_outline'}
        label={
          sent
            ? workout
              ? 'Thanks'
              : 'Thanks for your feedback'
            : workout
              ? 'Feedback'
              : crash
                ? 'Send feedback'
                : 'Share feedback'
        }
        disabled={sent && source !== 'profile'}
        onPress={() => {
          setSent(false);
          setOpen(true);
        }}
      />
      <Sheet open={open} onDismiss={close}>
        <View className="gap-2">
          <Text className="font-mono text-xs tracking-widest text-muted">
            {workout ? 'A QUICK CHECK-IN' : 'SHARE FEEDBACK'}
          </Text>
          <Text
            accessibilityRole="header"
            className="font-sans text-3xl font-light tracking-tight text-chalk"
          >
            {workout
              ? 'How did tracking work?'
              : crash
                ? 'What were you doing?'
                : 'How can we make it better?'}
          </Text>
          <Text className="font-sans text-base leading-normal text-soft">
            {workout
              ? 'Your feedback helps us see what needs work.'
              : crash
                ? 'It goes with the error report, so we can find what broke.'
                : 'What’s working, what’s frustrating, or what would you like us to add?'}
          </Text>
        </View>
        {workout && (
          <View className="flex-row justify-around gap-3">
            {REACTIONS.map((choice) => (
              <View key={choice} className="flex-1 items-center gap-2">
                <IconButton
                  icon={FACES[choice]}
                  label={`${choice} tracking`}
                  checked={reaction === choice}
                  size={32}
                  diameter={64}
                  fill={reaction === choice ? colors.line : colors.ground}
                  color={reaction === choice ? colors.mark : colors.soft}
                  onPress={() => {
                    tick();
                    setReaction(choice);
                  }}
                />
                <Text
                  className="font-sans text-base"
                  style={{ color: reaction === choice ? colors.chalk : colors.muted }}
                >
                  {choice}
                </Text>
              </View>
            ))}
          </View>
        )}
        {workout && expanded && (
          <View className="gap-3 border-t border-line pt-4">
            <Text className="font-sans text-lg tracking-tight text-chalk">
              {measure === 'seconds'
                ? 'How was the timing?'
                : measure === 'mixed'
                  ? 'How accurate was it?'
                  : 'How was the counting?'}
            </Text>
            <Segments choices={['Accurate', 'Not sure']} value={accuracy} onChange={setAccuracy} />
            <Segments choices={[less, more]} value={accuracy} onChange={setAccuracy} />
          </View>
        )}
        {expanded && (
          <View className="gap-3">
            {workout && (
              <Text className="font-sans text-base text-soft">Anything else? (optional)</Text>
            )}
            <TextInput
              accessibilityLabel={workout ? 'Anything else? Optional feedback' : 'Your feedback'}
              value={message}
              onChangeText={setMessage}
              multiline
              maxLength={1000}
              cursorColor={colors.mark}
              selectionColor={colors.line}
              selectionHandleColor={colors.mark}
              placeholder={
                workout
                  ? 'What happened? What could be better?'
                  : crash
                    ? 'I tapped…'
                    : 'Your impressions, ideas or feature requests…'
              }
              placeholderTextColor={colors.faint}
              textAlignVertical="top"
              className="h-32 rounded-lg border border-line p-3 font-sans text-base text-chalk"
            />
          </View>
        )}
        {failed && (
          <Text accessibilityLiveRegion="polite" className="font-sans text-sm text-warn">
            Couldn’t send feedback. Your answers are still here. Please try again.
          </Text>
        )}
        <View className="flex-row items-center gap-3">
          <TextButton label="Not now" onPress={close} color={colors.muted} />
          <View className="flex-1">
            <PrimaryButton
              label="Send feedback"
              disabled={!canSendFeedback(draft)}
              onPress={send}
            />
          </View>
        </View>
      </Sheet>
    </>
  );
}
