import * as Sharing from 'expo-sharing';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import {
  GestureDetector,
  GestureHandlerRootView,
  usePanGesture,
} from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { useRef } from 'react';

import { OVER_VIDEO, Screens, useReel } from './reel-player';
import { IconButton } from '@/components/icon-button';
import { tick } from '@/components/tick';
import { EXERCISES } from '@/exercises/registry';
import { Night } from '@/components/colors';
import { dark as colors } from '@/theme';
import { isHold } from '@/challenges/hold';
import { pointAt, weight, type Clip, type Spot } from '@/challenges/reel';
import { setShare } from '@/workout/plan/results';

/**
 * Full screen, like stories: the sets back to back from `start`, which set is on and what it got, and the
 * session as one bar, a segment per set. Tap the right of the picture for the next set, the left for the
 * one before; hold to pause; tap or drag the bar to move through the whole session. Swipe down (or back,
 * or ✕) closes it, handing back where it was.
 */
export function SessionViewer({
  clips: available,
  sets,
  start,
  onClose,
}: {
  clips: readonly Clip[];
  sets: number;
  start: Spot;
  onClose: (at: Spot) => void;
}) {
  const { top, bottom } = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { clips, players, front, shown, spot, go, progress } = useReel(available, start, onClose);
  const close = () => onClose(spot);
  // Stories: the next set, or the one before; on the first set, back to its start.
  const step = (by: 1 | -1) => {
    const clip = (spot.clip + by + clips.length) % clips.length;
    go(by === -1 && spot.clip === 0 ? { clip: 0, part: 0 } : { clip, part: 0 });
  };
  const scrub = (x: number) => {
    const to = pointAt(clips, x);
    if (to.clip !== spot.clip) tick();
    go(to, to.into);
  };

  const drag = useSharedValue(0);
  const pan = usePanGesture({
    activeOffsetY: 12, // downward drags only
    failOffsetX: [-24, 24], // sideways moves stay with the bar
    onUpdate: (e) => {
      drag.set(Math.max(0, e.translationY));
    },
    onDeactivate: (e) => {
      if (!e.canceled && (e.translationY > height * 0.2 || e.velocityY > 1000))
        drag.set(
          withTiming(height, { duration: 180 }, (done) => {
            if (done) scheduleOnRN(close);
          }),
        );
      else drag.set(withSpring(0));
    },
  });
  const backdrop = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(1, drag.get() / (height * 0.5)),
  }));
  const content = useAnimatedStyle(() => ({ transform: [{ translateY: drag.get() }] }));

  const { set, result } = clips[spot.clip];
  const { name } = EXERCISES[result.exercise];
  const hold = isHold(result.exercise);
  const got = hold ? result.heldMs / 1000 : result.reps;
  const rounds = clips.some((clip) => clip.result.round > 1);
  const goal = result.goal.type === 'max' ? '' : `/${result.goal.n}${hold ? 'S' : ''}`;
  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={close}
    >
      {/* Video is watched in the dark in either theme. */}
      {/* A Modal is its own native root on Android: gestures need their own root view. */}
      <Night>
        <GestureHandlerRootView style={StyleSheet.absoluteFill}>
          <Animated.View
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.ground }, backdrop]}
          />
          <GestureDetector gesture={pan}>
            <Animated.View style={[{ flex: 1, paddingTop: top, paddingBottom: bottom }, content]}>
              <Pressable
                accessibilityRole="adjustable"
                accessibilityLabel="Sets of this session"
                accessibilityValue={{ text: `set ${spot.clip + 1} of ${clips.length} filmed` }}
                accessibilityHint="Tap the right side for the next set, the left for the one before"
                accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
                onAccessibilityAction={({ nativeEvent }) =>
                  step(nativeEvent.actionName === 'increment' ? 1 : -1)
                }
                onPress={({ nativeEvent }) => step(nativeEvent.locationX < width / 3 ? -1 : 1)}
                // Paused for as long as the finger stays down.
                onLongPress={() => shown.pause()}
                onPressOut={() => shown.play()}
                className="flex-1"
              >
                <Screens players={players} front={front} fit="contain" />
              </Pressable>
              <View
                className="absolute inset-x-0 flex-row justify-between px-4"
                style={{ top: top + 8 }}
              >
                <IconButton icon="close" label="Close" fill={OVER_VIDEO} onPress={close} />
                <IconButton
                  icon="share"
                  label="Send this set"
                  fill={OVER_VIDEO}
                  onPress={() => void shareTake(clips[spot.clip].takes[spot.part])}
                />
              </View>
              <View
                className="absolute inset-x-0 gap-4 px-5 pt-16"
                style={{
                  bottom: 0,
                  paddingBottom: bottom + 28,
                  backgroundImage: `linear-gradient(180deg, transparent 0%, ${colors.ground}D9 45%)`,
                }}
              >
                <View className="flex-row items-end justify-between gap-4">
                  <View className="shrink gap-1.5">
                    <Text className="font-mono text-xs tracking-widest text-soft">
                      {`SET ${set + 1} OF ${sets}${rounds ? ` · ROUND ${result.round}` : ''}`}
                    </Text>
                    <Text
                      numberOfLines={1}
                      className="font-sans text-3xl font-light tracking-tight text-chalk capitalize"
                    >
                      {name}
                    </Text>
                  </View>
                  <View className="flex-row items-baseline gap-1">
                    <Text
                      className="font-sans text-6xl font-extralight leading-none tracking-tighter"
                      style={{
                        color: setShare(result.goal, got) >= 1 ? colors.accent : colors.chalk,
                      }}
                    >
                      {Math.floor(got)}
                    </Text>
                    <Text className="font-mono text-xs tracking-widest text-soft">{goal}</Text>
                  </View>
                </View>
                <SetBar clips={clips} now={spot.clip} progress={progress} onScrub={scrub} />
              </View>
            </Animated.View>
          </GestureDetector>
        </GestureHandlerRootView>
      </Night>
    </Modal>
  );
}

/**
 * The session as one bar: a segment per filmed set, as wide as the set ran. Sets before `now` are full,
 * `now` fills with `progress`. Tap or drag along it to scrub through the whole session, with a tick per
 * set crossed, like the day strip.
 */
function SetBar({
  clips,
  now,
  progress,
  onScrub,
}: {
  clips: readonly Clip[];
  now: number;
  progress: SharedValue<number>;
  onScrub: (x: number) => void;
}) {
  const width = useRef(1);
  const pan = usePanGesture({
    runOnJS: true,
    // Sideways only: a drag that goes down first is the swipe that closes.
    activeOffsetX: [-8, 8],
    failOffsetY: [-12, 12],
    // On touch down, so a tap jumps without waiting for a drag.
    onBegin: (e) => onScrub(e.x / width.current),
    onUpdate: (e) => onScrub(e.x / width.current),
  });
  return (
    <GestureDetector gesture={pan}>
      {/* Touch only: the video above is the same control for TalkBack, with its actions. 48dp to grab. */}
      <View
        importantForAccessibility="no-hide-descendants"
        onLayout={({ nativeEvent }) => {
          width.current = nativeEvent.layout.width;
        }}
        className="h-12 flex-row items-center gap-0.75"
      >
        {clips.map((clip, i) => (
          // Clips don't reorder.
          <Segment
            key={i}
            weight={weight(clip)}
            state={i < now ? 'past' : i === now ? 'now' : 'next'}
            progress={progress}
          />
        ))}
      </View>
    </GestureDetector>
  );
}

function Segment({
  weight,
  state,
  progress,
}: {
  weight: number;
  state: 'past' | 'now' | 'next';
  progress: SharedValue<number>;
}) {
  const fill = useAnimatedStyle(() => ({
    width: `${(state === 'past' ? 1 : state === 'now' ? progress.get() : 0) * 100}%`,
  }));
  return (
    <View
      className="overflow-hidden rounded-full bg-chalk/25"
      // The playing set's segment stands out a little, like the selected day on the day strip.
      style={{ flex: weight, height: state === 'now' ? 6 : 4 }}
    >
      <Animated.View className="h-full bg-chalk" style={fill} />
    </View>
  );
}

/** Opens the system share sheet with one of the session's files. */
// shortcut: shares the file as filmed, with no watermark; the Monetization Plan marks free clips, so add
// it before pilots share any (it needs a re-encode step, and its own plan).
async function shareTake(uri: string) {
  try {
    if (await Sharing.isAvailableAsync())
      await Sharing.shareAsync(uri, { mimeType: 'video/mp4', dialogTitle: 'Send this set' });
  } catch (error) {
    console.warn('[share] could not share a set', error);
  }
}
