import { Canvas, Points, type SkPoint } from '@shopify/react-native-skia';
import { shallowEqual, useActorRef, useSelector } from '@xstate/react';
import { useLocalSearchParams } from 'expo-router';
import { useRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import {
  Camera,
  CommonResolutions,
  useAsyncRunner,
  useCameraPermission,
  useFrameOutput,
  type CameraRef,
} from 'react-native-vision-camera';
import type { PoseDetection } from 'superhabit-pose';

import { CHALLENGES, type Challenge } from '@/pose/exercises';
import { sessionView, workoutSession, type View as SessionView } from '@/pose/session';
import { colors } from '@/theme';

const CAMERA = 'front';
// The VGA 4:3 frame, as width / height in portrait.
const FRAME_ASPECT = 3 / 4;

/** Visible landmarks in preview coordinates; the native transform includes front-camera mirroring. */
function toViewPoints(preview: CameraRef | null, result: PoseDetection): SkPoint[] {
  if (!preview) return [];
  try {
    return result.cameraLandmarks
      .filter((_, i) => (result.landmarks[i]?.visibility ?? 0) > 0.5)
      .map((point) => preview.convertCameraPointToViewPoint(point))
      .filter(({ x, y }) => Number.isFinite(x) && Number.isFinite(y));
  } catch {
    // CameraX has no sensor-to-view transform until the preview is ready.
    return [];
  }
}

function Centered({ text }: { text: string }) {
  return (
    <View className="flex-1 items-center justify-center bg-ground p-6">
      <Text className="text-center font-sans text-chalk">{text}</Text>
    </View>
  );
}

// One route for every challenge: /squat (the squat test), /pushup, /squat-pushup.
export default function ChallengeScreen() {
  const { challenge: id } = useLocalSearchParams<{ challenge: string }>();
  const challenge = CHALLENGES.get(id);
  if (!challenge) return <Centered text="No such challenge." />;
  if (Platform.OS !== 'android') return <Centered text="Pose tracking is available on Android." />;
  // A new id is a new session actor.
  return <AndroidSession key={id} challenge={challenge} />;
}

function AndroidSession({ challenge }: { challenge: Challenge }) {
  const { hasPermission, requestPermission } = useCameraPermission();
  const asyncRunner = useAsyncRunner();
  const camera = useRef<CameraRef>(null);
  // Drawn by Skia on the UI thread straight from this shared value.
  const dots = useSharedValue<SkPoint[]>([]);
  const session = useActorRef(workoutSession, {
    input: { challenge, onPose: (result) => dots.set(toViewPoints(camera.current, result)) },
  });
  const landmarker = useSelector(session, (s) => s.context.landmarker);
  // Only discrete counter changes re-render; per-frame data stays out of React state.
  const view = useSelector(session, sessionView, shallowEqual);
  // The orientation lock lands asynchronously; lay out from the real window.
  const { width, height } = useWindowDimensions();
  const landscape = width > height;

  const frameOutput = useFrameOutput({
    targetResolution: CommonResolutions.VGA_4_3,
    pixelFormat: 'rgb', // CameraX converts to RGBA; the native detector copies it to a Bitmap.
    onFrame(frame) {
      'worklet';
      // No `finally` here or below: React Compiler skips any component that uses one.
      let accepted = false;
      try {
        if (landmarker) {
          accepted = asyncRunner.runAsync(() => {
            'worklet';
            // The runner only clears its busy flag when this task returns normally, so never throw.
            // Results reach JS through the detector's native onResult callback, not across runtimes.
            try {
              try {
                landmarker.detect(frame);
              } catch (error) {
                console.error('[pose] frame processing failed', error);
              }
              frame.dispose();
            } catch (error) {
              console.error('[pose] frame dispose failed', error);
            }
          });
        }
      } catch (error) {
        console.error('[pose] frame scheduling failed', error);
      }
      if (!accepted) frame.dispose();
    },
  });

  if (!hasPermission) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-ground p-6">
        <Text className="text-center font-sans text-chalk">
          Camera access is needed to count reps.
        </Text>
        <Pressable
          onPress={() => void requestPermission()}
          className="h-12 items-center justify-center rounded-full bg-accent px-6"
          accessibilityRole="button"
        >
          <Text className="font-sans text-base font-medium text-ground">Allow camera</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className={`flex-1 bg-ground ${landscape ? 'flex-row' : 'justify-center'}`}>
      {/* Layout only; CameraX's sensor-to-view transform maps the dots to the preview. */}
      <View
        style={
          landscape
            ? { height: '100%', aspectRatio: 1 / FRAME_ASPECT }
            : { width: '100%', aspectRatio: FRAME_ASPECT }
        }
      >
        <Camera
          ref={camera}
          style={{ flex: 1 }}
          device={CAMERA}
          isActive={view.stage !== 'finished'}
          orientationSource="interface"
          resizeMode="contain"
          outputs={[frameOutput]}
        />
        <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
          <Points
            points={dots}
            mode="points"
            color={colors.accent}
            strokeWidth={10}
            strokeCap="round"
          />
        </Canvas>
      </View>

      {view.stage === 'switching' ? (
        <BetweenSets
          view={view}
          landscape={landscape}
          onContinue={() => session.send({ type: 'next' })}
        />
      ) : (
        <View
          className={`absolute gap-2 rounded-3xl border border-line bg-ground/90 p-4 ${
            landscape ? 'bottom-4 right-4 top-4 w-60' : 'inset-x-3 bottom-8'
          }`}
        >
          {view.stage === 'finished' ? (
            <Text className="font-mono text-xs tracking-widest text-accent">CHALLENGE DONE</Text>
          ) : (
            view.sets > 1 && (
              <Text className="font-mono text-xs tracking-widest text-muted">
                {view.name.toUpperCase()} · SET {view.set} OF {view.sets}
              </Text>
            )
          )}
          <View className={landscape ? 'gap-2' : 'flex-row items-end justify-between'}>
            <Count reps={view.reps} target={view.target} />
            <View className={`gap-1 ${landscape ? '' : 'items-end pb-3'}`}>
              <Text className="font-mono text-xs tracking-widest text-muted">
                {view.phase.toUpperCase()}
              </Text>
              <Text className="font-mono text-xs tracking-widest text-warn">
                NO-REPS {view.noReps}
              </Text>
            </View>
          </View>
          {view.stats && (
            <Text className="font-mono text-xs tracking-widest text-muted">{view.stats}</Text>
          )}
          {view.stage === 'counting' && (
            <View className={`flex-row gap-2 ${landscape ? 'mt-auto' : ''}`}>
              <Pressable
                onPress={() => session.send({ type: 'reset' })}
                className="h-12 flex-1 items-center justify-center rounded-full bg-accent"
                accessibilityRole="button"
              >
                <Text className="font-sans text-base font-medium text-ground">Reset</Text>
              </Pressable>
              <Pressable
                onPress={() => session.send({ type: 'next' })}
                className="h-12 flex-1 items-center justify-center rounded-full border border-edge"
                accessibilityRole="button"
              >
                <Text className="font-sans text-base font-medium text-chalk">End set</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

/** Big rep count, with "/target" for a finite set. */
function Count({ reps, target }: { reps: number; target: number }) {
  return (
    <View className="flex-row items-end gap-1.5">
      <Text className="font-sans text-8xl font-extralight leading-none text-chalk">{reps}</Text>
      {Number.isFinite(target) && (
        <Text className="pb-2 font-sans text-3xl font-light text-faint">/{target}</Text>
      )}
    </View>
  );
}

// shortcut: a dark token scrim, not a blur. expo-blur on Android can't blur a SurfaceView camera preview; revisit if the preview moves to a TextureView.
/** Between sets, over the live camera: the finished set, then how to place the phone for the next one. */
function BetweenSets({
  view,
  landscape,
  onContinue,
}: {
  view: SessionView;
  landscape: boolean;
  onContinue: () => void;
}) {
  const { next } = view;
  if (!next) return null;
  return (
    <View
      className={`absolute inset-0 gap-5 bg-ground/70 p-4 ${landscape ? 'flex-row items-end' : ''}`}
    >
      <View className={`gap-2.5 pt-3 ${landscape ? 'flex-1 self-start' : ''}`}>
        <Text className="font-mono text-xs font-medium tracking-widest text-soft">
          {view.name.toUpperCase()} · SET {view.set} OF {view.sets} DONE
        </Text>
        <Count reps={view.reps} target={view.target} />
        <View className="h-2 rounded-sm bg-accent" />
      </View>

      <View
        className={`gap-4 rounded-3xl border border-line bg-ground/90 p-5 ${landscape ? 'w-96' : 'mt-auto'}`}
      >
        <View className="gap-1.5">
          <Text className="font-mono text-xs font-medium tracking-widest text-muted">
            NEXT · {Number.isFinite(view.nextReps) ? `${view.nextReps} ` : ''}
            {next.name.toUpperCase()}
          </Text>
          <Text className="font-sans text-2xl font-light text-chalk">{next.place}</Text>
        </View>
        <View className="gap-2.5">
          {next.steps.map((step, i) => (
            <View key={step} className="flex-row gap-3">
              <Text className="w-5 pt-0.5 font-mono text-xs text-muted">{`0${i + 1}`}</Text>
              <Text className="flex-1 font-sans text-base text-soft">{step}</Text>
            </View>
          ))}
        </View>
        <Pressable
          onPress={onContinue}
          className="h-14 items-center justify-center rounded-full bg-accent"
          accessibilityRole="button"
        >
          <Text className="font-sans text-lg font-medium text-ground">Continue</Text>
        </Pressable>
        <Text className="text-center font-sans text-sm text-muted">{next.hint}</Text>
      </View>
    </View>
  );
}
