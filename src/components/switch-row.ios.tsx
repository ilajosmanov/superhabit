import { Host, Toggle } from '@expo/ui/swift-ui';
import { disabled as off, labelsHidden, tint } from '@expo/ui/swift-ui/modifiers';
import { Text, View } from 'react-native';

import { useColors } from './colors';

import { tick } from './tick';

/** A setting: its label and what the current value means, then iOS's switch with a selection tick. */
export function SwitchRow({
  label,
  note,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  note: string;
  value: boolean;
  onChange: (on: boolean) => void;
  /** While a change is being saved: drawn as it is, but taps wait. */
  disabled?: boolean;
}) {
  const colors = useColors();
  return (
    <View className="flex-row items-center gap-4">
      <View className="flex-1 gap-1">
        <Text className="font-sans text-base text-chalk">{label}</Text>
        <Text className="font-sans text-sm text-muted">{note}</Text>
      </View>
      <Host matchContents>
        {/* The hidden label still names the switch for VoiceOver. */}
        <Toggle
          label={label}
          isOn={value}
          onIsOnChange={(on) => {
            tick();
            onChange(on);
          }}
          modifiers={[labelsHidden(), tint(colors.accent), off(disabled)]}
        />
      </Host>
    </View>
  );
}
