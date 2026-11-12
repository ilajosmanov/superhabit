import { useState } from 'react';
import { Text, View } from 'react-native';

import { mss } from '@/lib/duration';
import { ExerciseFigure } from '@/components/illustrations';
import { Icon } from '@/components/icon';
import { PrimaryButton } from '@/components/primary-button';
import { EXERCISES } from '@/exercises/registry';
import { capitalise } from '@/lib/text';
import { dark as colors } from '@/theme';
import type { SessionView } from '@/workout/session/session-view';

import { Clock, CloseButton, Frame, GLASS, SecondaryButton, SetLine } from './controls';
import { spokenGoal } from './goal-line';
import { BarClock, RingClock } from './time-left';

// "0:45" in Geist ExtraLight is ~1.95 em wide; a little over 2 em keeps every rest under 10 minutes on one line.
const CLOCK_EM = 2.1;

/**
 * Boards 19a (landscape) and 19b (portrait): a rest between sets. The time left is the far layer, a
 * numeral with an amber bar or ring draining, sized to the room it gets (the 360 dp phones have less);
 * the next set waits on a glass card for when you lean in. An open-ended rest has no clock: the card's
 * Continue ends it.
 */
export function RestView({
  view,
  landscape,
  onContinue,
  onEnd,
}: {
  view: SessionView;
  landscape: boolean;
  onContinue: () => void;
  onEnd: () => void;
}) {
  // The free area beside or above the card, measured: insets, cutouts and the card all take from it.
  const [area, setArea] = useState({ width: 0, height: 0 });
  const { restS, restLeftS, nextExercise, nextGoal } = view;
  if (!nextExercise || !nextGoal) return null;
  const timed = restS !== null && restLeftS !== null;
  const amount = view.unit === 'seconds' ? `${view.heldS} S` : view.reps;
  // Landscape: the numeral and bar span the area's width less its padding. Portrait: the ring takes what
  // is left under the "done" row, and the numeral fits inside the ring.
  const barWidth = area.width - 56;
  const ring = Math.min(area.width, 340, area.height - 48);
  const size = landscape
    ? Math.min(200, barWidth / CLOCK_EM)
    : Math.min(128, (ring - 48) / CLOCK_EM);
  const left = timed && (
    <Text
      maxFontSizeMultiplier={1}
      className="font-sans font-extralight tracking-tighter text-chalk"
      // Past the type scale on purpose: the far clock is read from across the room. Tabular, so it holds
      // still as the seconds tick.
      style={{ fontSize: size, lineHeight: size, fontVariant: ['tabular-nums'] }}
    >
      {mss(restLeftS)}
    </Text>
  );
  return (
    <>
      <View className={`absolute inset-0 ${landscape ? 'bg-ground/85' : 'bg-ground/50'}`} />
      <Frame landscape={landscape}>
        <View className="flex-1">
          <View className="flex-row items-center gap-2 self-start">
            <CloseButton onPress={onEnd} label="End workout" />
            <Clock elapsedS={view.elapsedS} recording={false} waiting={false} />
          </View>
          <View
            accessible
            accessibilityRole="timer"
            accessibilityLabel={timed ? `Rest, ${restLeftS} seconds left` : 'Rest'}
            className={`flex-1 justify-center gap-3.5 ${landscape ? 'px-7' : 'items-center'}`}
            onLayout={(e) => setArea(e.nativeEvent.layout)}
          >
            <View className={`flex-row items-center gap-2 ${landscape ? '' : 'self-center'}`}>
              <Icon name="check" size={16} color={colors.accent} />
              <Text
                numberOfLines={1}
                className="shrink font-mono text-sm font-medium tracking-widest text-soft"
              >
                {amount} {view.name.toUpperCase()} DONE · REST
              </Text>
            </View>
            {area.width > 0 &&
              (!timed ? (
                <Text
                  maxFontSizeMultiplier={1}
                  className="font-sans text-9xl font-extralight leading-none tracking-tighter text-chalk"
                >
                  Rest
                </Text>
              ) : landscape ? (
                <>
                  {left}
                  <BarClock key={view.set} width={barWidth} totalS={restS} leftS={restLeftS} />
                </>
              ) : (
                <RingClock key={view.set} size={ring} totalS={restS} leftS={restLeftS}>
                  {left}
                </RingClock>
              ))}
          </View>
        </View>
        <View className={`gap-3.5 rounded-3xl p-5 ${GLASS} ${landscape ? 'w-74' : ''}`}>
          <View className="flex-row items-center gap-3">
            <ExerciseFigure exercise={nextExercise} size={48} weight={1.8} />
            <View className="flex-1">
              <SetLine at={view.set} sets={view.sets} label="Next" />
            </View>
          </View>
          {/* 36 in the 256 px landscape card: "Jumping jacks" at 48 would wrap and push the button out. */}
          <Text
            maxFontSizeMultiplier={1}
            className={`font-sans font-light tracking-tight text-chalk ${landscape ? 'text-4xl' : 'text-5xl'}`}
          >
            {capitalise(EXERCISES[nextExercise].name)}
          </Text>
          <Text maxFontSizeMultiplier={1.3} className="font-sans text-xl font-light text-soft">
            {spokenGoal(nextGoal, nextExercise)} ·{' '}
            {view.samePlacement ? 'same spot' : 'then move the phone'}
          </Text>
          {timed ? (
            <SecondaryButton onPress={onContinue} label="Skip rest" className="mt-auto h-12" />
          ) : (
            <PrimaryButton onPress={onContinue} label="Continue" className="mt-auto h-15" />
          )}
        </View>
      </Frame>
    </>
  );
}
