import { Canvas, Points, type SkPoint } from '@shopify/react-native-skia';
import { shallowEqual, useActorRef, useSelector } from '@xstate/react';
import { useRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
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

import { FRAME_ASPECT } from '@/pose/squat';
import { squatSession } from '@/pose/squatSession';
import { colors } from '@/theme';

const CAMERA = 'front';
const fmtMs = (ms: number | null) => (ms === null ? '—' : `${(ms / 1000).toFixed(1)}s`);

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

// Spike: test squat rep counting on a real device. Prop the phone up, 2–3 m away, whole body in frame.
export default function SquatTest() {
  if (Platform.OS !== 'android') {
    return (
      <View className="flex-1 items-center justify-center bg-ground p-6">
        <Text className="text-center font-sans text-chalk">
          Pose tracking is available on Android.
        </Text>
      </View>
    );
  }
  return <AndroidSquatTest />;
}

function AndroidSquatTest() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const asyncRunner = useAsyncRunner();
  const camera = useRef<CameraRef>(null);
  // Drawn by Skia on the UI thread straight from this shared value.
  const dots = useSharedValue<SkPoint[]>([]);
  const session = useActorRef(squatSession, {
    input: { onPose: (result) => dots.set(toViewPoints(camera.current, result)) },
  });
  const landmarker = useSelector(session, (s) => s.context.landmarker);
  // Only discrete counter changes re-render; per-frame data stays out of React state.
  const {
    reps,
    noReps,
    phase,
    lastRep: rep,
  } = useSelector(
    session,
    ({ context: { squat } }) => ({
      reps: squat.reps,
      noReps: squat.noReps,
      phase: squat.phase,
      lastRep: squat.lastRep,
    }),
    shallowEqual,
  );

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
                console.error('[squat] frame processing failed', error);
              }
              frame.dispose();
            } catch (error) {
              console.error('[squat] frame dispose failed', error);
            }
          });
        }
      } catch (error) {
        console.error('[squat] frame scheduling failed', error);
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
    <View className="flex-1 justify-center bg-ground">
      {/* Layout only; CameraX's sensor-to-view transform maps the dots to the preview. */}
      <View style={{ width: '100%', aspectRatio: FRAME_ASPECT }}>
        <Camera
          ref={camera}
          style={{ flex: 1 }}
          device={CAMERA}
          isActive
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

      <View className="absolute inset-x-3 bottom-8 gap-2 rounded-3xl border border-line bg-ground/90 p-4">
        <View className="flex-row items-end justify-between">
          <Text className="font-sans text-8xl font-extralight leading-none text-chalk">{reps}</Text>
          <View className="items-end gap-1 pb-3">
            <Text className="font-mono text-xs tracking-widest text-muted">
              {phase.toUpperCase()}
            </Text>
            <Text className="font-mono text-xs tracking-widest text-warn">NO-REPS {noReps}</Text>
          </View>
        </View>
        {rep && (
          <Text className="font-mono text-xs tracking-widest text-muted">
            {Math.round(rep.depth)}° · SYM {Math.round(rep.symmetry)}° · {fmtMs(rep.downMs)}↓{' '}
            {fmtMs(rep.upMs)}↑ · LEAN {Math.round(rep.lean)}°
            {rep.cues.length ? ` · ${rep.cues.join(', ')}` : ''}
          </Text>
        )}
        <Pressable
          onPress={() => session.send({ type: 'reset' })}
          className="h-12 items-center justify-center rounded-full bg-accent"
          accessibilityRole="button"
        >
          <Text className="font-sans text-base font-medium text-ground">Reset</Text>
        </Pressable>
      </View>
    </View>
  );
}
