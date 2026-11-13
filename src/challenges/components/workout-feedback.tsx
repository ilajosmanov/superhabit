import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { countAnswers, pickAccuracy } from '@/challenges/workout-feedback';
import { Chip, ChipRow } from '@/components/chip';
import { useColors } from '@/components/colors';
import { REACTIONS, type Reaction } from '@/components/feedback';
import { FeedbackSheet } from '@/components/feedback-sheet';
import { IconButton } from '@/components/icon-button';
import { TrackedFigure, type Fit } from '@/components/illustrations';
import { tick } from '@/components/tick';

/** Each answer as the camera's dots landing on a body. What's sent stays Bad / Okay / Good. */
const LOOKS: Record<Reaction, { label: string; fit: Fit }> = {
  Bad: { label: 'Lost me', fit: 'lost' },
  Okay: { label: 'Mostly', fit: 'close' },
  Good: { label: 'Spot on', fit: 'on' },
};

const WORDS = {
  kicker: 'QUICK CHECK-IN',
  title: 'How well did the camera see you?',
  placeholder: 'What happened? What could be better?',
};

/**
 * Beside Done: a disc as tall as the key, and the check-in it opens (on its own when `initiallyOpen`).
 * How well it tracked you, then whether it counted right; the answers survive dismissal until sent. The
 * disc stays: a second thought can follow the first.
 */
export function WorkoutFeedback({
  initiallyOpen,
  reps,
  holds,
  details,
}: {
  initiallyOpen: boolean;
  /** What the workout had, so only answers that apply show. */
  reps: boolean;
  holds: boolean;
  details: Record<string, string>;
}) {
  const colors = useColors();
  const [open, setOpen] = useState(initiallyOpen);
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const [accuracy, setAccuracy] = useState<string[]>([]);
  const answers = countAnswers(reps, holds);
  return (
    <>
      <IconButton
        icon="chat_bubble"
        label="Share workout feedback"
        fill={colors.surface}
        diameter={60}
        onPress={() => setOpen(true)}
      />
      <FeedbackSheet
        open={open}
        onClose={() => setOpen(false)}
        words={WORDS}
        optional
        draft={(message) => ({
          source: 'workout',
          message,
          reaction,
          accuracy: accuracy.join(', ') || null,
          details,
        })}
        onSent={() => {
          setReaction(null);
          setAccuracy([]);
        }}
      >
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

        {reaction && (
          <View className="gap-3">
            <Text className="font-mono text-xs tracking-widest text-muted">
              DID IT COUNT RIGHT?
            </Text>
            <ChipRow>
              {answers.map((answer) => (
                <Chip
                  key={answer}
                  label={answer}
                  selected={accuracy.includes(answer)}
                  onPress={() => {
                    tick();
                    setAccuracy(pickAccuracy(answers, accuracy, answer));
                  }}
                />
              ))}
            </ChipRow>
          </View>
        )}
      </FeedbackSheet>
    </>
  );
}
