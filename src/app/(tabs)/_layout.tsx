import { AndroidHaptics } from 'expo-haptics';
import type { SFSymbol } from 'expo-symbols';
import { MaterialIcon, NativeTabs } from 'expo-router/native-tabs';

import { tick } from '@/components/tick';
import { useColors } from '@/components/colors';

const label = { fontFamily: 'Geist', fontSize: 12 } as const;

// Android's own on-screen-key tick.
const tap = () => tick(AndroidHaptics.Virtual_Key);

// `sf` is iOS's: the outline, filled when its tab is selected, as the system's own tab bars do.
const items: {
  name: string;
  icon: MaterialIcon['md'];
  sf: { default: SFSymbol; selected: SFSymbol };
  label: string;
}[] = [
  { name: 'index', icon: 'home', sf: { default: 'house', selected: 'house.fill' }, label: 'Home' },
  {
    name: 'challenges',
    icon: 'flag',
    sf: { default: 'flag', selected: 'flag.fill' },
    label: 'Challenges',
  },
  {
    name: 'leaderboard',
    icon: 'leaderboard',
    sf: { default: 'chart.bar', selected: 'chart.bar.fill' },
    label: 'League',
  },
  {
    name: 'me',
    icon: 'person',
    sf: { default: 'person', selected: 'person.fill' },
    label: 'Profile',
  },
];

/** The platform's own bottom tab bar (Material on Android, iOS's on iPhone), in the gym-floor palette. */
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
      // iOS tints the selected icon and label with this.
      tintColor={colors.chalk}
      indicatorColor={colors.surface}
      rippleColor={colors.line}
      screenListeners={{ tabPress: tap }}
    >
      {items.map((item, key) => (
        <NativeTabs.Trigger key={key} name={item.name}>
          <NativeTabs.Trigger.Icon md={item.icon} sf={item.sf} />
          <NativeTabs.Trigger.Label>{item.label}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
