import { Host, Switch } from '@expo/ui/jetpack-compose';
import { AndroidHaptics, performAndroidHapticsAsync } from 'expo-haptics';
import { Text, View } from 'react-native';

import { colors } from '@/theme';

/** A setting: its label and what the current value means, then Material's switch with a toggle tick. */
export function SwitchRow({
  label,
  note,
  value,
  onChange,
}: {
  label: string;
  note: string;
  value: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <View className="flex-row items-center gap-4">
      <View className="flex-1 gap-1">
        <Text className="font-sans text-base text-chalk">{label}</Text>
        <Text className="font-sans text-sm text-muted">{note}</Text>
      </View>
      <Host matchContents>
        <Switch
          value={value}
          onCheckedChange={(on) => {
            void performAndroidHapticsAsync(
              on ? AndroidHaptics.Toggle_On : AndroidHaptics.Toggle_Off,
            );
            onChange(on);
          }}
          colors={{
            checkedTrackColor: colors.accent,
            checkedThumbColor: colors.ground,
            checkedBorderColor: colors.accent,
            uncheckedTrackColor: colors.ground,
            uncheckedThumbColor: colors.faint,
            uncheckedBorderColor: colors.faint,
          }}
        />
      </Host>
    </View>
  );
}
