import { Text, View } from 'react-native';

import { ExerciseFigure } from '@/components/illustrations';
import { capitalise } from '@/lib/text';
import { COUNTDOWN_S } from '@/workout/session/session';
import type { SessionView } from '@/workout/session/session-view';

import { Clock, CloseButton, Frame, GLASS, SetLine } from './controls';
import { GoalLine, spokenGoal } from './goal-line';
import { EdgeClock } from './time-left';

/**
 * Board 18b, the three seconds before a set on the same spot: what comes next is the hero (figure, name,
 * goal), the screen's edge is the clock and the number sits in the corner. Made to be read from 2–3 m.
 * Landscape dims the camera behind it; portrait keeps it visible, with the next set on a glass card.
 */
export function Countdown({
  view,
  landscape,
  onPause,
}: {
  view: SessionView & { countdown: number };
  landscape: boolean;
  onPause: () => void;
}) {
  const { exercise, goal, countdown } = view;
  const name = capitalise(view.name);
  // No seconds in it: a label that changed each second made TalkBack re-read it over the coach's count.
  const label = `Next: ${name}, ${spokenGoal(goal, exercise)}`;
  const line = <SetLine at={view.set - 1} sets={view.sets} label="Next" />;
  return (
    <>
      <View className={`absolute inset-0 ${landscape ? 'bg-ground/90' : 'bg-ground/50'}`} />
      <EdgeClock key={view.set} totalS={COUNTDOWN_S} leftS={countdown} />
      <Frame landscape={landscape}>
        <View className="flex-1">
          <View className="flex-row items-center gap-2 self-start">
            <CloseButton onPress={onPause} label="Pause" />
            <Clock
              elapsedS={view.elapsedS}
              recording={view.recording}
              waiting={false}
              lowSpace={view.lowSpace}
            />
          </View>
          <Text
            importantForAccessibility="no"
            maxFontSizeMultiplier={1}
            className={`absolute top-0 right-4 font-sans font-extralight leading-none tracking-tighter text-accent ${landscape ? 'text-8xl' : 'text-9xl'}`}
          >
            {countdown}
          </Text>
          <View
            accessible
            accessibilityRole="timer"
            accessibilityLabel={label}
            accessibilityLiveRegion="polite"
            className={
              landscape
                ? 'flex-1 flex-row items-center gap-10 px-6'
                : `mt-auto gap-3.5 rounded-3xl p-5 ${GLASS}`
            }
          >
            {landscape ? (
              <>
                <ExerciseFigure exercise={exercise} size={180} weight={1.3} />
                <View className="flex-1 gap-2.5">
                  {/* Clear of the corner numeral, which sits over this column's top right. */}
                  <View className="pr-16">{line}</View>
                  <Text
                    maxFontSizeMultiplier={1}
                    className="font-sans text-6xl font-light leading-none tracking-tight text-chalk"
                  >
                    {name}
                  </Text>
                  <GoalLine goal={goal} exercise={exercise} />
                </View>
              </>
            ) : (
              <>
                <View className="flex-row items-center gap-3">
                  <ExerciseFigure exercise={exercise} size={48} weight={1.8} />
                  <View className="flex-1">{line}</View>
                </View>
                <GoalLine goal={goal} exercise={exercise} />
                <Text
                  maxFontSizeMultiplier={1}
                  className="font-sans text-5xl font-light tracking-tight text-chalk"
                >
                  {name}
                </Text>
              </>
            )}
          </View>
        </View>
      </Frame>
    </>
  );
}
