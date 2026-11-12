import type { ComponentProps } from 'react';
import { Pressable, Text, View, type PressableProps } from 'react-native';

import { ExerciseStack } from './exercise-stack';
import { Icon } from '@/components/icon';
import { useColors } from '@/components/colors';

/**
 * The softly filled row of the catalog and of a day on Home (no outline: the joined card has that): a name and one mono line, the exercises under
 * them (never beside: a long circuit can't squeeze the name), and one big number with its unit. The rest
 * of the props go to the pressable, so a `Link asChild` can wrap it.
 */
export function ExerciseRow({
  name,
  line,
  icon,
  steps,
  amount,
  unit,
  ...pressable
}: {
  name: string;
  line: string;
  /** Before the line, e.g. play when the row plays its videos. */
  icon?: ComponentProps<typeof Icon>['name'];
  steps: ComponentProps<typeof ExerciseStack>['steps'];
  amount: string | number;
  unit: string;
} & PressableProps) {
  const colors = useColors();
  return (
    // The wrapper clips the ripple to the card's corners.
    <View className="overflow-hidden rounded-2xl bg-surface">
      <Pressable
        android_ripple={{ color: colors.line }}
        className="flex-row items-center gap-4 px-5 py-4"
        {...pressable}
      >
        <View className="flex-1 gap-3">
          <View className="gap-1">
            <Text className="font-sans text-lg tracking-tight text-chalk">{name}</Text>
            <View className="flex-row items-center gap-1.5">
              {icon && <Icon name={icon} size={14} color={colors.muted} />}
              <Text className="font-mono text-xs tracking-wide text-muted">{line}</Text>
            </View>
          </View>
          <ExerciseStack steps={steps} />
        </View>
        <View className="items-end gap-1">
          <Text className="font-sans text-5xl font-extralight leading-none tracking-tighter text-chalk">
            {amount}
          </Text>
          <Text className="font-mono text-xs tracking-widest text-muted">{unit}</Text>
        </View>
      </Pressable>
    </View>
  );
}
