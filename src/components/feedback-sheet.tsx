import {
  FilterChip,
  FlowRow,
  Host,
  RNHostView,
  Text as ComposeText,
} from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { COMPOSE_LABEL } from '@/theme';

import { useColors } from './colors';
import {
  canSendFeedback,
  REACTIONS,
  sendFeedback,
  type FeedbackSource,
  type Reaction,
} from './feedback';
import { Icon } from './icon';
import { IconButton } from './icon-button';
import { TrackedFigure, type Fit } from './illustrations';
import { PrimaryButton } from './primary-button';
import { useSnackbar } from './snackbar';
import { Sheet } from './sheet';
import { TextButton } from './text-button';
import { tick } from './tick';

type Measure = 'reps' | 'seconds' | 'mixed';

/** Each answer as the camera's dots landing on a body. What's sent stays Bad / Okay / Good. */
const LOOKS: Record<Reaction, { label: string; fit: Fit }> = {
  Bad: { label: 'Lost me', fit: 'lost' },
  Okay: { label: 'Mostly', fit: 'close' },
  Good: { label: 'Spot on', fit: 'on' },
};

/** The follow-up for what the session measured: [what's sent, what the chip says]. */
const COUNTING: Record<Measure, { question: string; answers: [string, string][] }> = {
  reps: {
    question: 'DID IT COUNT EVERY REP?',
    answers: [
      ['Accurate', 'Every rep'],
      ['Missed reps', 'Missed some'],
      ['Counted extra', 'Counted extra'],
      ['Not sure', 'Not sure'],
    ],
  },
  seconds: {
    question: 'WAS THE TIME RIGHT?',
    answers: [
      ['Accurate', 'Right'],
      ['Too short', 'Too short'],
      ['Too long', 'Too long'],
      ['Not sure', 'Not sure'],
    ],
  },
  mixed: {
    question: 'DID IT COUNT RIGHT?',
    answers: [
      ['Accurate', 'Right'],
      ['Too little', 'Too little'],
      ['Too much', 'Too much'],
      ['Not sure', 'Not sure'],
    ],
  },
};

const WORDS: Record<
  FeedbackSource,
  { kicker: string; title: string; lede?: string; placeholder: string }
> = {
  workout: {
    kicker: 'QUICK CHECK-IN',
    title: 'How well did the camera see you?',
    placeholder: 'What happened? What could be better?',
  },
  profile: {
    kicker: 'SHARE FEEDBACK',
    title: 'What should we make better?',
    lede: 'Something broken, missing or just right? Say it in your own words.',
    placeholder: 'I wish it…',
  },
  crash: {
    kicker: 'SOMETHING BROKE',
    title: 'What were you doing?',
    lede: 'It goes with the error report, so we can find what broke.',
    placeholder: 'I tapped…',
  },
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
  measure?: Measure;
  details?: Record<string, string>;
}) {
  const colors = useColors();
  const notify = useSnackbar();
  const [open, setOpen] = useState(initiallyOpen);
  const [message, setMessage] = useState('');
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const [accuracy, setAccuracy] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState(false);
  const workout = source === 'workout';
  const crash = source === 'crash';
  const words = WORDS[source];
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
    notify?.('Thanks, feedback sent');
  };

  return (
    <>
      {workout ? (
        // Beside Done: a disc as tall as the key. It stays: a second thought can follow the first.
        <IconButton
          icon="chat_bubble"
          label="Share workout feedback"
          fill={colors.surface}
          diameter={60}
          onPress={() => setOpen(true)}
        />
      ) : (
        <TextButton
          wide={crash}
          icon={crash ? undefined : 'chat_bubble'}
          label={crash ? (sent ? 'Thanks for your feedback' : 'Send feedback') : 'Share feedback'}
          disabled={sent && crash}
          onPress={() => {
            setSent(false);
            setOpen(true);
          }}
        />
      )}
      <Sheet open={open} onDismiss={close}>
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

        {workout && (
          <View accessibilityRole="radiogroup" className="flex-row gap-2">
            {REACTIONS.map((choice) => {
              const on = reaction === choice;
              return (
                // The wrapper clips the ripple to the well's corners; the ring says which is picked.
                <View
                  key={choice}
                  className="flex-1 overflow-hidden rounded-2xl bg-ground"
                  style={{ borderWidth: 1.5, borderColor: on ? colors.mark : 'transparent' }}
                >
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityLabel={`${LOOKS[choice].label}: how well it tracked you`}
                    accessibilityState={{ checked: on }}
                    android_ripple={{ color: colors.line }}
                    onPress={() => {
                      tick();
                      setReaction(choice);
                    }}
                    className="h-34 items-center justify-between pt-4 pb-3.5"
                  >
                    <TrackedFigure fit={LOOKS[choice].fit} />
                    <Text
                      className="font-sans text-base font-medium tracking-tight"
                      style={{ color: on || reaction === null ? colors.chalk : colors.muted }}
                    >
                      {LOOKS[choice].label}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}

        {workout && reaction && (
          <View className="gap-3">
            <Text className="font-mono text-xs tracking-widest text-muted">
              {COUNTING[measure].question}
            </Text>
            <Host matchContents={{ vertical: true }}>
              <FlowRow
                horizontalArrangement={{ spacedBy: 8 }}
                verticalArrangement={{ spacedBy: 0 }}
                modifiers={[fillMaxWidth()]}
              >
                {COUNTING[measure].answers.map(([value, label]) => (
                  <FilterChip
                    key={value}
                    selected={accuracy === value}
                    onClick={() => {
                      tick();
                      setAccuracy(value);
                    }}
                    border={{ color: accuracy === value ? colors.line : colors.edge }}
                    colors={{
                      containerColor: 'transparent',
                      labelColor: colors.soft,
                      selectedContainerColor: colors.line,
                      selectedLabelColor: colors.chalk,
                    }}
                  >
                    <FilterChip.Label>
                      <ComposeText style={COMPOSE_LABEL}>{label}</ComposeText>
                    </FilterChip.Label>
                    {accuracy === value && (
                      <FilterChip.LeadingIcon>
                        <RNHostView matchContents>
                          <Icon name="check" size={18} color={colors.mark} />
                        </RNHostView>
                      </FilterChip.LeadingIcon>
                    )}
                  </FilterChip>
                ))}
              </FlowRow>
            </Host>
          </View>
        )}

        <View className={workout ? 'gap-3' : 'gap-2.5'}>
          {workout && (
            <View className="flex-row justify-between">
              <Text className="font-mono text-xs tracking-widest text-muted">ANYTHING ELSE</Text>
              <Text className="font-mono text-xs tracking-widest text-subtle">OPTIONAL</Text>
            </View>
          )}
          {/* A well one tone below the sheet, no outline; a ring while you type. */}
          <TextInput
            accessibilityLabel={workout ? 'Anything else? Optional' : 'Your feedback'}
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
            className={`${workout ? 'h-22' : 'h-28'} rounded-2xl bg-ground font-sans text-base text-chalk`}
            // Padding as style: Android's own TextInput padding wins over the class.
            style={{
              borderWidth: 1.5,
              borderColor: focused ? colors.mark : 'transparent',
              paddingHorizontal: 16,
              paddingVertical: 14,
            }}
          />
          {!workout && (
            <View className="flex-row items-center gap-2">
              <Icon name="smartphone" size={16} color={colors.muted} />
              <Text className="flex-1 font-sans text-sm text-muted">
                {crash ? 'The error report, app version' : 'Your app version'} and phone model go
                with it.
              </Text>
            </View>
          )}
        </View>

        {failed && (
          <View accessibilityLiveRegion="polite" className="flex-row items-center gap-2.5">
            <Icon name="error" size={20} color={colors.warn} />
            <Text className="flex-1 font-sans text-sm text-chalk">
              Couldn’t send. {workout ? 'Your answers are' : 'What you wrote is'} still here.
            </Text>
          </View>
        )}

        <View className="flex-row items-center gap-3">
          <TextButton label="Not now" onPress={close} color={colors.muted} />
          <View className="flex-1">
            <PrimaryButton
              label={failed ? 'Try again' : 'Send'}
              accessibilityLabel={failed ? 'Try sending again' : 'Send feedback'}
              disabled={!canSendFeedback(draft)}
              onPress={send}
            />
          </View>
        </View>
      </Sheet>
    </>
  );
}
