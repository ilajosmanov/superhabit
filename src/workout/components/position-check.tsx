import { Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ExerciseFigure } from '@/components/illustrations';
import { EXERCISES, type BodyPart } from '@/exercises/registry';
import { capitalise } from '@/lib/text';
import { dark as colors } from '@/theme';

import { Chip } from './controls';
import { GoalLine, spokenGoal } from './goal-line';
import { Header, type PlatterProps } from './platter-header';

export const PART_LABEL: Record<BodyPart, string> = {
  head: 'Head and shoulders',
  hands: 'Hands',
  hips: 'Hips',
  feet: 'Feet',
};

/** Board 09: waiting for the start position, with what is out of frame. */
export function PositionCheck(props: PlatterProps) {
  const { view, landscape, onFlipCamera, onToggleSkeleton } = props;
  const { ready, parts, hint } = EXERCISES[view.exercise];
  return (
    <>
      <Header {...props}>
        <Chip icon="cameraswitch" label="Switch camera" onPress={onFlipCamera} />
        <Chip
          icon="accessibility_new"
          label="Skeleton"
          checked={view.skeleton}
          onPress={onToggleSkeleton}
        />
      </Header>
      {/* Board 09 v2: which exercise, and how much, readable from the start position. Two lines: "100
          jumping jacks" on one is wider than the landscape platter. */}
      <View
        accessible
        accessibilityRole="header"
        accessibilityLabel={`${capitalise(view.name)}, ${spokenGoal(view.goal, view.exercise)}. ${ready}`}
        className="gap-1"
      >
        <View className="flex-row items-end gap-3">
          <ExerciseFigure exercise={view.exercise} size={56} weight={1.6} />
          <GoalLine goal={view.goal} exercise={view.exercise} size="md" />
        </View>
        <Text
          maxFontSizeMultiplier={1}
          className="font-sans text-3xl font-light tracking-tight text-chalk"
        >
          {capitalise(view.name)}
        </Text>
      </View>
      <View className="gap-2">
        {parts.map((part) => {
          const out = view.missing.includes(part);
          return (
            <View
              key={part}
              accessible
              accessibilityLabel={`${PART_LABEL[part]}, ${out ? 'out of frame' : 'in frame'}`}
              className="flex-row items-center gap-2.5"
            >
              <Icon
                name={out ? 'close' : 'check'}
                size={18}
                color={out ? colors.warn : colors.accent}
              />
              <Text className={`font-sans text-base ${out ? 'text-warn' : 'text-chalk'}`}>
                {PART_LABEL[part]}
                {out && ' · out of frame'}
              </Text>
            </View>
          );
        })}
      </View>
      <Text className={`font-sans text-sm leading-snug text-soft ${landscape ? 'mt-auto' : ''}`}>
        {hint}
      </Text>
    </>
  );
}
