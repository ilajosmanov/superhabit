import { useEventListener } from 'expo';
import * as Sharing from 'expo-sharing';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import { useRef, useState, type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import {
  GestureDetector,
  GestureHandlerRootView,
  usePanGesture,
} from 'react-native-gesture-handler';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { IconButton } from '@/components/icon-button';
import { tick } from '@/components/tick';
import { EXERCISES } from '@/exercises/registry';
import { colors } from '@/theme';
import { after, pointAt, weight, type Clip, type Spot } from '@/workout/reel';
import { setShare } from '@/workout/results';

/** Ground at 70 %: buttons over the playing video. */
export const OVER_VIDEO = 'rgba(13,14,11,0.7)';
/** How often a player reports its time, s; the bar glides across each interval. */
const REPORT_S = 0.1;

const same = (a: Spot, b: Spot) => a.clip === b.clip && a.part === b.part;

/**
 * Plays the reel's files one after another, muted (they have no sound, and sound would take audio focus
 * from the user's music), back to the first after the last. Two players take turns: while one plays, the
 * other holds the next file, loaded and waiting, so a file ends straight into the next one with no blank
 * player between them. `go` jumps to a file, `along` (0 to 1) into it; `progress` is how far through the
 * clip on screen, 0 to 1, kept off React state because it moves ten times a second.
 */
function useReel(clips: readonly Clip[], start: Spot) {
  const uri = ({ clip, part }: Spot) => clips[clip].takes[part];
  const setup = (play: boolean) => (p: VideoPlayer) => {
    p.muted = true;
    p.timeUpdateEventInterval = REPORT_S;
    if (play) p.play();
  };
  // Sources fixed at mount: a changed source would make the hook replace it behind our back.
  const players = [
    useVideoPlayer(uri(start), setup(true)),
    useVideoPlayer(uri(after(clips, start)), setup(false)),
  ] as const;
  const [{ spot, front }, setState] = useState({ spot: start, front: 0 });
  const shown = players[front];
  const waiting = players[1 - front];
  const progress = useSharedValue(0);
  // How far into a file to start once it loads: a jump lands before its duration is known.
  const into = useRef(0);
  // A jumped-to file is loading: `currentTime` and `duration` still belong to the old one.
  const loading = useRef(false);
  const share = (at: Spot, along: number) => (at.part + along) / clips[at.clip].takes.length;

  // The waiting player already holds the next file: show it, and load the one after into the other.
  const advance = () => {
    const next = after(clips, spot);
    // A jump still loading is left behind: its seek must not land on the next file.
    loading.current = false;
    into.current = 0;
    waiting.play();
    shown.pause();
    progress.set(share(next, 0));
    setState({ spot: next, front: 1 - front });
    void shown.replaceAsync(uri(after(clips, next)));
  };
  const go = (to: Spot, along = 0) => {
    if (same(to, spot)) {
      // A scrub on while the file loads moves where it starts, so it resumes where the finger stopped.
      if (loading.current) into.current = along;
      // seekBy, not assigning currentTime: React Compiler forbids mutating the hook's value.
      else if (shown.duration > 0) shown.seekBy(along * shown.duration - shown.currentTime);
    } else if (along === 0 && same(to, after(clips, spot))) {
      advance();
      return;
    } else {
      into.current = along;
      loading.current = true;
      setState({ spot: to, front });
      void shown.replaceAsync(uri(to));
      shown.play();
      void waiting.replaceAsync(uri(after(clips, to)));
    }
    progress.set(share(to, along));
  };
  // Each player reports all the time; only the one on screen moves the reel.
  const ended = (i: number) => () => {
    if (i === front) advance();
  };
  const loaded =
    (i: number) =>
    ({ duration }: { duration: number }) => {
      if (i !== front) return;
      loading.current = false;
      if (into.current > 0) shown.seekBy(into.current * duration - shown.currentTime);
      into.current = 0;
    };
  const played =
    (i: number) =>
    ({ currentTime }: { currentTime: number }) => {
      if (i !== front || shown.duration <= 0) return;
      const along = share(spot, Math.min(1, currentTime / shown.duration));
      // Glides to the reported time over one report, instead of stepping ten times a second.
      progress.set(withTiming(along, { duration: REPORT_S * 1000, easing: Easing.linear }));
    };
  useEventListener(players[0], 'playToEnd', ended(0));
  useEventListener(players[1], 'playToEnd', ended(1));
  useEventListener(players[0], 'sourceLoad', loaded(0));
  useEventListener(players[1], 'sourceLoad', loaded(1));
  useEventListener(players[0], 'timeUpdate', played(0));
  useEventListener(players[1], 'timeUpdate', played(1));
  return { players, front, shown, spot, go, progress };
}

/** Both players' views, stacked; only the one playing shows. */
function Screens({
  players,
  front,
  fit,
}: {
  players: readonly [VideoPlayer, VideoPlayer];
  front: number;
  fit: 'contain' | 'cover';
}) {
  return players.map((player, i) => (
    // TextureView: a SurfaceView ignores the parent's opacity and the viewer's drag transform.
    <VideoView
      // The two players never swap places.
      key={i}
      player={player}
      style={[StyleSheet.absoluteFill, { opacity: i === front ? 1 : 0 }]}
      contentFit={fit}
      nativeControls={false}
      surfaceType="textureView"
    />
  ));
}

/**
 * The session's sets on a loop, one after another, sized and placed by `className`; `children` (given the
 * set on screen) draw over it, and `expand` places a button that opens it full screen, as a tap does.
 * `sets` is how many sets the session has, filmed or not. While full screen is open the loop lets go of its
 * players, and picks up where full screen left off.
 */
export function SessionLoop({
  clips,
  sets,
  expand,
  className,
  children,
}: {
  clips: readonly Clip[];
  sets: number;
  expand: Pick<ViewStyle, 'top' | 'right' | 'bottom'>;
  className: string;
  children: (clip: Clip) => ReactNode;
}) {
  const [watching, setWatching] = useState<Spot | null>(null);
  const [from, setFrom] = useState<Spot>({ clip: 0, part: 0 });
  if (watching)
    return (
      <>
        <View className={className}>{children(clips[watching.clip])}</View>
        <SessionViewer
          clips={clips}
          sets={sets}
          start={watching}
          onClose={(at) => {
            setFrom(at);
            setWatching(null);
          }}
        />
      </>
    );
  return (
    <Loop clips={clips} start={from} expand={expand} className={className} onWatch={setWatching}>
      {children}
    </Loop>
  );
}

function Loop({
  clips,
  start,
  expand,
  className,
  onWatch,
  children,
}: {
  clips: readonly Clip[];
  start: Spot;
  expand: Pick<ViewStyle, 'top' | 'right' | 'bottom'>;
  className: string;
  onWatch: (at: Spot) => void;
  children: (clip: Clip) => ReactNode;
}) {
  const { players, front, spot } = useReel(clips, start);
  return (
    // Tap anywhere for sight; TalkBack gets the button below and still reads the text over the video.
    <Pressable onPress={() => onWatch(spot)} accessible={false} className={className}>
      <View className="absolute inset-0 opacity-75" pointerEvents="none">
        <Screens players={players} front={front} fit="cover" />
      </View>
      {children(clips[spot.clip])}
      <IconButton
        icon="open_in_full"
        label="Watch the session full screen"
        size={18}
        fill={OVER_VIDEO}
        onPress={() => onWatch(spot)}
        style={{ position: 'absolute', ...expand }}
      />
    </Pressable>
  );
}

/**
 * Full screen, like stories: the sets back to back from `start`, which set is on and what it got, and the
 * session as one bar, a segment per set. Tap the right of the picture for the next set, the left for the
 * one before; hold to pause; tap or drag the bar to move through the whole session. Swipe down (or back,
 * or ✕) closes it, handing back where it was.
 */
function SessionViewer({
  clips,
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
  const { players, front, shown, spot, go, progress } = useReel(clips, start);
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
  const { name, kind } = EXERCISES[result.exercise];
  const got = kind === 'hold' ? result.heldMs / 1000 : result.reps;
  const rounds = clips.some((clip) => clip.result.round > 1);
  const goal = result.goal.type === 'max' ? '' : `/${result.goal.n}${kind === 'hold' ? ' S' : ''}`;
  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={close}
    >
      {/* A Modal is its own native root on Android: gestures need their own root view. */}
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
      // Touch only: the video above is the same control for TalkBack, with its actions. 48dp to
      grab.
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
async function shareTake(uri: string) {
  try {
    if (await Sharing.isAvailableAsync())
      await Sharing.shareAsync(uri, { mimeType: 'video/mp4', dialogTitle: 'Send this set' });
  } catch (error) {
    console.warn('[share] could not share a set', error);
  }
}
