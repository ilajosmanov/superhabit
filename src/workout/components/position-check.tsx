import { Text, View } from 'react-native';

import { CHECK, CLOSE, Glyph } from '@/components/glyph';
import { EXERCISES, type BodyPart } from '@/exercises/registry';
import { colors } from '@/theme';

import { Chip } from './controls';
import { Header, type PlatterProps } from './platter-header';

const FLIP_CAMERA =
  'M3 8.5A1.5 1.5 0 0 1 4.5 7h2.3l1.5-2h7.4l1.5 2h2.3A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-9ZM8.5 12.5a3.5 3.5 0 0 1 6.3-2.1M15 8.5v2h-2M15.5 13.5a3.5 3.5 0 0 1-6.3 2.1M9 17.5v-2h2';
const SKELETON =
  'M10 4.5a2 2 0 1 0 4 0a2 2 0 1 0-4 0M12 6.5V14M7 10.5l5-2 5 2M12 14l-3 6M12 14l3 6';

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
        <Chip d={FLIP_CAMERA} label="Switch camera" onPress={onFlipCamera} />
        <Chip d={SKELETON} label="Skeleton" checked={view.skeleton} onPress={onToggleSkeleton} />
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
              <Glyph
                d={out ? CLOSE : CHECK}
                size={16}
                weight={2.5}
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
