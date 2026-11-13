import { Button, Host } from '@expo/ui/swift-ui';
import {
  accessibilityAddTraits,
  buttonBorderShape,
  buttonStyle,
  font,
  foregroundStyle,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { View } from 'react-native';

import { useColors } from './colors';

/** iOS's capsule buttons, wrapping, one of them picked (filled, with a check) or none yet. */
export function ChoiceChips({
  answers,
  value,
  onChange,
}: {
  /** Each chip's value and its label. */
  answers: readonly (readonly [string, string])[];
  value: string | null;
  onChange: (value: string) => void;
}) {
  const colors = useColors();
  return (
    <View className="flex-row flex-wrap gap-2">
      {answers.map(([answer, label]) => {
        const on = value === answer;
        return (
          <Host key={answer} matchContents>
            <Button
              label={label}
              systemImage={on ? 'checkmark' : undefined}
              onPress={() => onChange(answer)}
              modifiers={[
                buttonStyle(on ? 'borderedProminent' : 'bordered'),
                buttonBorderShape('capsule'),
                tint(colors.line),
                foregroundStyle(on ? colors.chalk : colors.soft),
                font({ family: 'Geist', size: 15, weight: 'medium' }),
                ...(on ? [accessibilityAddTraits(['isSelected'])] : []),
              ]}
            />
          </Host>
        );
      })}
    </View>
  );
}
