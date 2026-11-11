import * as Haptics from 'expo-haptics';
import { MaterialIcon, NativeTabs } from 'expo-router/native-tabs';
import { Platform } from 'react-native';

import { colors } from '@/theme';

const label = { fontFamily: 'Geist', fontSize: 12 } as const;

// Android's own on-screen-key tick, which follows the user's system touch-feedback setting.
const tap = () =>
  void (Platform.OS === 'android'
    ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Virtual_Key)
    : Haptics.selectionAsync());

const items: { name: string; icon: MaterialIcon['md']; label: string }[] = [
  { name: 'index', icon: 'home', label: 'Home' },
  { name: 'challenges', icon: 'flag', label: 'Challenges' },
  { name: 'friends', icon: 'group', label: 'Friends' },
  { name: 'me', icon: 'person', label: 'Profile' },
];

/** The platform's own bottom tab bar (Material on Android), in the gym-floor palette. */
export default function TabsLayout() {
  return (
    <NativeTabs
      backgroundColor={colors.ground}
      iconColor={{ default: colors.muted, selected: colors.chalk }}
      labelStyle={{
        default: { ...label, color: colors.muted },
        selected: { ...label, fontWeight: '500', color: colors.chalk },
      }}
      indicatorColor={colors.surface}
      rippleColor={colors.line}
      screenListeners={{ tabPress: tap }}
    >
      {items.map((item, key) => (
        <NativeTabs.Trigger key={key} name={item.name}>
          <NativeTabs.Trigger.Icon md={item.icon} />
          <NativeTabs.Trigger.Label>{item.label}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
