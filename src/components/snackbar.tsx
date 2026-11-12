import { createContext, useContext, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Text, View } from 'react-native';
import Animated, { Keyframe, ReduceMotion, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { lit } from '@/theme';

import { useColors } from './colors';
import { Icon } from './icon';

const Notice = createContext<((message: string) => void) | null>(null);

/** In and out take this long each; the message holds 3 s between. */
const FADE = 220;
const HOLD = 3000;
const IN = Math.round((FADE / (2 * FADE + HOLD)) * 100);
const OUT = 100 - IN;

/**
 * A short confirmation over the app: a capsule that hugs its words, centred 16dp above the tab bar or a
 * footer. Our own, not Material's snackbar, which can't take Geist or a capsule. A new message replaces
 * the one showing. The keyframes hold and dismiss it, so no timer runs.
 */
export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; id: number } | null>(null);
  const show = (message: string) => {
    AccessibilityInfo.announceForAccessibility(message);
    setToast((shown) => ({ message, id: (shown?.id ?? 0) + 1 }));
  };
  return (
    <Notice value={show}>
      {children}
      {toast && (
        <Toast
          key={toast.id}
          message={toast.message}
          onGone={() => setToast((shown) => (shown?.id === toast.id ? null : shown))}
        />
      )}
    </Notice>
  );
}

function Toast({ message, onGone }: { message: string; onGone: () => void }) {
  const colors = useColors();
  const { bottom } = useSafeAreaInsets();
  // Reduced motion keeps the fade, without the rise.
  const rise = useReducedMotion() ? 0 : 12;
  const life = new Keyframe({
    0: { opacity: 0, transform: [{ translateY: rise }] },
    [IN]: { opacity: 1, transform: [{ translateY: 0 }] },
    [OUT]: { opacity: 1, transform: [{ translateY: 0 }] },
    100: { opacity: 0, transform: [{ translateY: 0 }] },
  })
    .duration(2 * FADE + HOLD)
    // The fade is the only way it leaves, so it must run even when the phone turns animations off.
    .reduceMotion(ReduceMotion.Never)
    .withCallback((finished) => {
      'worklet';
      if (finished) scheduleOnRN(onGone);
    });
  return (
    <View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      className="absolute inset-x-0 items-center"
      // Above Done's footer (60 + 16) and the tab bar (80), with 16 to spare.
      style={{ bottom: bottom + 92 }}
    >
      <Animated.View
        entering={life}
        className="h-13 flex-row items-center gap-3 rounded-full bg-surface pl-2 pr-5"
        style={{
          // A hairline rim and a soft shadow lift the surface off whatever is under it.
          boxShadow: `inset 0 0 0 1px ${colors.chalk}14, 0 12px 32px ${colors.ink}40, 0 2px 6px ${colors.ink}1f`,
        }}
      >
        <View className="h-9 w-9 items-center justify-center rounded-full bg-accent" style={lit}>
          <Icon name="check" size={22} color={colors.ink} />
        </View>
        <Text className="font-sans text-base font-medium tracking-tight text-chalk">{message}</Text>
      </Animated.View>
    </View>
  );
}

/** Null on the root crash screen, which keeps its own confirmation when the app tree has failed. */
export const useSnackbar = () => useContext(Notice);
