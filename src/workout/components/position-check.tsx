import { Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { EXERCISES, type BodyPart } from '@/exercises/registry';
import { colors } from '@/theme';

import { Chip } from './controls';
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
      <Text
        accessibilityRole="header"
        className="font-sans text-4xl font-light leading-tight tracking-tight text-chalk"
      >
        {ready}
      </Text>
      <View className="mt-1.5 gap-2.5">
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
