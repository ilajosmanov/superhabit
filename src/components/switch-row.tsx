import { Host, Switch } from '@expo/ui/jetpack-compose';
import { semantics } from '@expo/ui/jetpack-compose/modifiers';
import { AndroidHaptics } from 'expo-haptics';
import { Text, View } from 'react-native';

import { useColors } from './colors';

import { tick } from './tick';

/** A setting: its label and what the current value means, then Material's switch with a toggle tick. */
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
        <Switch
          // TalkBack names the switch by the row's label, not just "Off, switch".
          modifiers={[semantics({ contentDescription: label })]}
          value={value}
          enabled={!disabled}
          onCheckedChange={(on) => {
            tick(on ? AndroidHaptics.Toggle_On : AndroidHaptics.Toggle_Off);
            onChange(on);
          }}
          colors={{
            checkedTrackColor: colors.accent,
            checkedThumbColor: colors.ink,
            checkedBorderColor: colors.accent,
            uncheckedTrackColor: colors.ground,
            uncheckedThumbColor: colors.faint,
            uncheckedBorderColor: colors.faint,
            disabledCheckedTrackColor: colors.accent,
            disabledCheckedThumbColor: colors.ink,
            disabledCheckedBorderColor: colors.accent,
            disabledUncheckedTrackColor: colors.ground,
            disabledUncheckedThumbColor: colors.faint,
            disabledUncheckedBorderColor: colors.faint,
          }}
        />
      </Host>
    </View>
  );
}
