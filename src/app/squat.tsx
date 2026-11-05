import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { createPoseLandmarker, type PoseLandmarker } from 'superhabit-pose';

import { useRepFeedback } from '@/feedback/useRepFeedback';
import {
  Camera,
  CommonResolutions,
  useAsyncRunner,
  useCameraPermission,
  useFrameOutput,
  type CameraRef,
} from 'react-native-vision-camera';

import {
  FRAME_ASPECT,
  initialSquat,
  kneeAngle,
  legAngles,
  measure,
  stepSquat,
  TRACKING_TIMEOUT_MS,
  type Pose,
} from '@/pose/squat';

const CAMERA = 'front';
const noPose: Pose = { image: [], world: [] };
const fmtMs = (ms: number | null) => (ms === null ? '—' : `${(ms / 1000).toFixed(1)}s`);

// Spike: test squat rep counting on a real device. Prop the phone up, 2–3 m away, whole body in frame.
export default function SquatTest() {
  if (Platform.OS !== 'android') {
    return (
      <View className="flex-1 items-center justify-center bg-[#0D0E0B] p-6">
        <Text className="text-center text-[#F2F0E8]">Pose tracking is available on Android.</Text>
      </View>
    );
  }
  return <AndroidSquatTest />;
}

function AndroidSquatTest() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const asyncRunner = useAsyncRunner();
  const camera = useRef<CameraRef>(null);
  const [landmarker, setLandmarker] = useState<PoseLandmarker | null>(null);
  const [pose, setPose] = useState(noPose);
  const [dots, setDots] = useState<{ x: number; y: number; visibility: number }[]>([]);
  const [squat, setSquat] = useState(initialSquat);
  // stepSquat advances a stateful filter, so step outside setState (Strict Mode replays updaters).
  const squatRef = useRef(initialSquat);
  const deg = kneeAngle(pose);
  const legs = legAngles(pose);
  const rep = squat.lastRep;
  useRepFeedback(squat.reps, squat.noReps, rep?.cues);

  useEffect(() => {
    const instance = createPoseLandmarker();
    // Effect ownership recreates the native resource after Strict Mode's cleanup/replay.
    // oxlint-disable-next-line react/set-state-in-effect
    setLandmarker(instance);
    return () => instance.close();
  }, []);

  useEffect(() => {
    if (!hasPermission) void requestPermission();
  }, [hasPermission, requestPermission]);

  // MediaPipe runs at camera speed; polling at ~15 Hz is plenty for squat timing.
  useEffect(() => {
    if (!landmarker) return;
    let lastTimestamp: number | undefined;
    let lastResultAt = 0;
    const id = setInterval(() => {
      const result = landmarker.result;
      const now = performance.now();
      const fresh = result !== undefined && result.timestampMs !== lastTimestamp;
      if (fresh) {
        lastTimestamp = result.timestampMs;
        lastResultAt = now;
      }
      const current = result && now - lastResultAt <= TRACKING_TIMEOUT_MS ? result : undefined;
      const p: Pose = current
        ? { image: current.landmarks, world: current.worldLandmarks }
        : noPose;
      setPose(p);
      // Re-reading an old detection must not keep an unfinished attempt alive indefinitely.
      squatRef.current = stepSquat(squatRef.current, fresh ? measure(p) : null, now);
      setSquat(squatRef.current);
      try {
        const preview = camera.current;
        setDots(
          preview && current
            ? current.cameraLandmarks.map((point, i) => ({
                ...preview.convertCameraPointToViewPoint(point),
                visibility: current.landmarks[i]?.visibility ?? 0,
              }))
            : [],
        );
      } catch {
        // CameraX has no sensor-to-view transform until the preview is ready.
        setDots([]);
      }
    }, 66);
    return () => clearInterval(id);
  }, [landmarker]);

  // Spike debug: log the moment a squat bottoms out (read with `adb logcat -s ReactNativeJS`).
  useEffect(() => {
    if (squat.phase !== 'down') return;
    const result = landmarker?.result;
    if (!result) return;
    const p: Pose = { image: result.landmarks, world: result.worldLandmarks };
    console.log(
      '[squat] DOWN',
      legAngles(p)?.map(Math.round),
      JSON.stringify(p.world.slice(23, 29)),
    );
  }, [squat.phase, landmarker]);

  const frameOutput = useFrameOutput({
    targetResolution: CommonResolutions.VGA_4_3,
    pixelFormat: 'rgb', // CameraX converts to RGBA; the native detector copies it to a Bitmap.
    onFrame(frame) {
      'worklet';
      let accepted = false;
      try {
        if (landmarker) {
          accepted = asyncRunner.runAsync(() => {
            'worklet';
            try {
              try {
                landmarker.detect(frame);
              } finally {
                frame.dispose();
              }
            } catch (error) {
              // The runner only clears its busy flag when this task returns normally.
              console.error('[squat] frame processing failed', error);
            }
          });
        }
      } catch (error) {
        console.error('[squat] frame scheduling failed', error);
      } finally {
        if (!accepted) frame.dispose();
      }
    },
  });

  if (!hasPermission) {
    return (
      <View className="flex-1 items-center justify-center bg-[#0D0E0B] p-6">
        <Text className="text-center text-[#F2F0E8]">Camera access is needed to count reps.</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 justify-center bg-[#0D0E0B]">
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
        {dots.map((p, i) =>
          p.visibility > 0.5 && Number.isFinite(p.x) && Number.isFinite(p.y) ? (
            <View
              key={i}
              pointerEvents="none"
              style={{
                position: 'absolute',
                // The native preview transform includes front-camera mirroring.
                left: p.x,
                top: p.y,
                width: 10,
                height: 10,
                marginLeft: -5,
                marginTop: -5,
                borderRadius: 5,
                backgroundColor: '#F2B544',
              }}
            />
          ) : null,
        )}
      </View>

      <View className="absolute inset-x-3 bottom-8 gap-2 rounded-3xl border border-[#2E3028] bg-[#0D0E0BE6] p-4">
        <View className="flex-row items-end justify-between">
          <Text className="text-[96px] font-extralight leading-[96px] text-[#F2F0E8]">
            {squat.reps}
          </Text>
          <View className="items-end gap-1 pb-3">
            <Text className="font-mono text-xs tracking-widest text-[#A3A396]">
              KNEE {deg === null ? '—' : `${Math.round(deg)}°`} · {squat.phase.toUpperCase()}
            </Text>
            <Text className="font-mono text-xs tracking-widest text-[#A3A396]">
              L {legs ? `${Math.round(legs[0])}°` : '—'} · R{' '}
              {legs ? `${Math.round(legs[1])}°` : '—'}
            </Text>
            <Text className="font-mono text-xs tracking-widest text-[#A3A396]">
              LAST DEPTH {squat.lastDepth === null ? '—' : `${Math.round(squat.lastDepth)}°`}
            </Text>
            <Text className="font-mono text-xs tracking-widest text-[#FF6A55]">
              NO-REPS {squat.noReps}
            </Text>
          </View>
        </View>
        {rep && (
          <Text className="font-mono text-xs tracking-widest text-[#A3A396]">
            {Math.round(rep.depth)}° · SYM {Math.round(rep.symmetry)}° · {fmtMs(rep.downMs)}↓{' '}
            {fmtMs(rep.upMs)}↑ · LEAN {Math.round(rep.lean)}°
            {rep.cues.length ? ` · ${rep.cues.join(', ')}` : ''}
          </Text>
        )}
        <Pressable
          onPress={() => {
            squatRef.current = initialSquat;
            setSquat(initialSquat);
          }}
          className="h-12 items-center justify-center rounded-full bg-[#F2B544]"
          accessibilityRole="button"
        >
          <Text className="text-[15px] font-medium text-[#0D0E0B]">Reset</Text>
        </Pressable>
      </View>
    </View>
  );
}
