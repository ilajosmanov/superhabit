import { NativeTabs } from 'expo-router/native-tabs';

import { colors } from '@/theme';

const label = { fontFamily: 'Geist', fontSize: 12 } as const;

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
    >
      <NativeTabs.Trigger name="today">
        <NativeTabs.Trigger.Icon md="schedule" />
        <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon md="flag" />
        <NativeTabs.Trigger.Label>Challenges</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="friends">
        <NativeTabs.Trigger.Icon md="group" />
        <NativeTabs.Trigger.Label>Friends</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="me">
        <NativeTabs.Trigger.Icon md="person" />
        <NativeTabs.Trigger.Label>Me</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
