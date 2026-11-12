import { AndroidHaptics } from 'expo-haptics';
import { MaterialIcon, NativeTabs } from 'expo-router/native-tabs';

import { tick } from '@/components/tick';
import { useColors } from '@/components/colors';

const label = { fontFamily: 'Geist', fontSize: 12 } as const;

// Android's own on-screen-key tick.
const tap = () => tick(AndroidHaptics.Virtual_Key);

const items: { name: string; icon: MaterialIcon['md']; label: string }[] = [
  { name: 'index', icon: 'home', label: 'Home' },
  { name: 'challenges', icon: 'flag', label: 'Challenges' },
  { name: 'leaderboard', icon: 'leaderboard', label: 'League' },
  { name: 'me', icon: 'person', label: 'Profile' },
];

/** The platform's own bottom tab bar (Material on Android), in the gym-floor palette. */
export default function TabsLayout() {
  const colors = useColors();
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
