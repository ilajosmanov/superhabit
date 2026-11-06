import { useEventListener } from 'expo';
import * as Sharing from 'expo-sharing';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useState } from 'react';
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
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { CLOSE, Glyph } from '@/components/glyph';
import { EXERCISES } from '@/exercises/registry';
import { colors } from '@/theme';
import type { BestRep } from '@/workout/best-rep';

/** Seconds of lead-in before the rep's bottom, and the window looped from there. */
const LEAD_S = 1;
const LOOP_S = 3;
const EXPAND = 'M14 4h6v6M10 20H4v-6M20 4l-6 6M4 20l6-6';
const SHARE = 'M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6';

const label = ({ name, rep, depth }: BestRep) =>
  `${name.replace(/s$/, '')} ${rep} · ${Math.round(depth)}°`;
const leadIn = (best: BestRep) => Math.max(0, best.atMs / 1000 - LEAD_S);

/**
 * The best rep as a preview card, muted, looping a LOOP_S window around its bottom; tap opens it full screen.
 * The file is filmed in its exercise's UI orientation: a landscape take fills a 16:9 card, a portrait one
 * is fit inside a square.
 */
export function BestRepClip({ best }: { best: BestRep }) {
  const [open, setOpen] = useState(false);
  const start = leadIn(best);
  const player = useVideoPlayer(best.uri, (p) => {
    p.muted = true;
    p.loop = true; // a window running past the file's end wraps to 0, then the check below re-seeks
    p.timeUpdateEventInterval = 0.1;
    p.currentTime = start;
    p.play();
  });
  // Keeps playback inside the window; also redoes the first seek if it landed before the file loaded.
  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    // seekBy, not assigning currentTime: React Compiler forbids mutating the hook's value.
    if (currentTime >= start + LOOP_S || currentTime < start - 0.5)
      player.seekBy(start - currentTime);
  });
  const landscape =
    Object.values(EXERCISES).find((e) => e.name === best.name)?.orientation === 'landscape';

  return (
    <>
      <Pressable
        onPress={() => {
          player.pause(); // the viewer has its own player; one decoder at a time
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel="Watch best rep full screen"
        accessibilityHint={label(best)}
        className={`${landscape ? 'aspect-video' : 'aspect-square'} overflow-hidden rounded-2xl border border-line bg-ground`}
      >
        <View className="absolute inset-0 opacity-75" pointerEvents="none">
          {/* TextureView: a SurfaceView ignores the parent's opacity and rounded clip. */}
          <VideoView
            player={player}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            nativeControls={false}
            surfaceType="textureView"
          />
        </View>
        <View className="absolute bottom-2.5 left-3 gap-0.5">
          <Text className="font-mono text-xs font-medium tracking-wider text-chalk uppercase">
            Best rep · {label(best)}
          </Text>
          <Text className="font-mono text-xs tracking-wider text-soft">0:0{LOOP_S}</Text>
        </View>
        <View className="absolute right-2 bottom-2 size-11 items-center justify-center rounded-full bg-ground/70">
          <Glyph d={EXPAND} size={18} />
        </View>
      </Pressable>
      {open && (
        <BestRepViewer
          best={best}
          onClose={() => {
            setOpen(false);
            player.play();
          }}
        />
      )}
    </>
  );
}

/**
 * Full-screen viewer: the whole set's file from the best rep's lead-in, native controls to scrub it.
 * Swipe down (or back, or ✕) closes it. Its own player, mounted only while open: one player on two views
 * fights over the surface on Android.
 */
function BestRepViewer({ best, onClose }: { best: BestRep; onClose: () => void }) {
  const { top, bottom } = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const start = leadIn(best);
  const player = useVideoPlayer(best.uri, (p) => {
    p.muted = true; // no audio track, and unmuted it would take audio focus from the user's music
    p.loop = true;
    p.currentTime = start;
    p.play();
  });
  // Redoes the first seek if it landed before the file loaded.
  useEventListener(player, 'sourceLoad', () => player.seekBy(start - player.currentTime));

  const drag = useSharedValue(0);
  const pan = usePanGesture({
    activeOffsetY: 12, // downward drags only
    failOffsetX: [-24, 24], // horizontal moves stay with the native seek bar
    onUpdate: (e) => {
      drag.set(Math.max(0, e.translationY));
    },
    onDeactivate: (e) => {
      if (!e.canceled && (e.translationY > height * 0.2 || e.velocityY > 1000))
        drag.set(
          withTiming(height, { duration: 180 }, (done) => {
            if (done) scheduleOnRN(onClose);
          }),
        );
      else drag.set(withSpring(0));
    },
  });
  const backdrop = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(1, drag.get() / (height * 0.5)),
  }));
  const content = useAnimatedStyle(() => ({ transform: [{ translateY: drag.get() }] }));

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      {/* A Modal is its own native root on Android: gestures need their own root view. */}
      <GestureHandlerRootView style={StyleSheet.absoluteFill}>
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.ground }, backdrop]}
        />
        <GestureDetector gesture={pan}>
          <Animated.View style={[{ flex: 1, paddingTop: top, paddingBottom: bottom }, content]}>
            {/* TextureView: it follows the drag transform; a SurfaceView can lag behind it. */}
            <VideoView
              player={player}
              style={{ flex: 1 }}
              contentFit="contain"
              nativeControls
              surfaceType="textureView"
            />
            <View
              className="absolute inset-x-0 flex-row justify-between px-4"
              style={{ top: top + 8 }}
            >
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
                className="size-11 items-center justify-center rounded-full bg-ground/70"
              >
                <Glyph d={CLOSE} size={20} />
              </Pressable>
              <Pressable
                onPress={() => void shareBestRep(best)}
                accessibilityRole="button"
                accessibilityLabel="Send my best set"
                className="size-11 items-center justify-center rounded-full bg-ground/70"
              >
                <Glyph d={SHARE} size={20} />
              </Pressable>
            </View>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

// shortcut: shares the whole set's file, not just the looped window (no trimming dependency yet);
// upgrade to a trimmed export of the window when a trimming dependency is worth adding.
/** Opens the system share sheet with the video of the best rep's set. */
export async function shareBestRep(best: BestRep) {
  try {
    if (await Sharing.isAvailableAsync())
      await Sharing.shareAsync(best.uri, {
        mimeType: 'video/mp4',
        dialogTitle: 'Send my best set',
      });
  } catch (error) {
    console.warn('[share] could not share the best rep', error);
  }
}
