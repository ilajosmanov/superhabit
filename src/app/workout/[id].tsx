import type { SkPoint } from '@shopify/react-native-skia';
import { shallowEqual, useActorRef, useSelector } from '@xstate/react';
import { useKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams, usePreventRemove, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useRef } from 'react';
import {
  Dimensions,
  Linking,
  Platform,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import {
  CommonResolutions,
  useCameraPermission,
  useVideoOutput,
  type CameraRef,
} from 'react-native-vision-camera';

import { filterJoints, type JointFilter } from '@/workout/pose/joint-filter';
import { PoseCamera, toViewJoints } from '@/workout/pose/pose-camera';
import { CHALLENGES } from '@/workout/challenges';
import type { Challenge } from '@/workout/plan';
import { BetweenSets } from '@/workout/components/between-sets';
import { ChallengeDone } from '@/workout/components/challenge-done';
import { LiveView } from '@/workout/components/live-view';
import { sessionView, workoutSession } from '@/workout/session';

function Centered({ text }: { text: string }) {
  return (
    <View className="flex-1 items-center justify-center bg-ground p-6">
      <Text className="text-center font-sans text-chalk">{text}</Text>
    </View>
  );
}

// The camera run for a challenge: /workout/squat, /workout/pushup, /workout/squat-pushup.
export default function ChallengeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { hasPermission, canRequestPermission, requestPermission } = useCameraPermission();
  const challenge = CHALLENGES.get(id);
  if (!challenge) return <Centered text="No such challenge." />;
  if (Platform.OS !== 'android') return <Centered text="Pose tracking is available on Android." />;
  // Before the session: its clock and orientation lock would run during the prompt.
  if (!hasPermission) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-ground p-6">
        <Text className="text-center font-sans text-chalk">
          Camera access is needed to count reps.
        </Text>
        {/* Once denied for good (Android's 'denied'), only Settings can grant it. */}
        <Pressable
          onPress={() => void (canRequestPermission ? requestPermission() : Linking.openSettings())}
          className="h-12 items-center justify-center rounded-full bg-accent px-6"
          accessibilityRole="button"
        >
          <Text className="font-sans text-base font-medium text-ground">
            {canRequestPermission ? 'Allow camera' : 'Open settings'}
          </Text>
        </Pressable>
      </View>
    );
  }
  // A new id is a new session actor.
  return <AndroidSession key={id} challenge={challenge} />;
}

function AndroidSession({ challenge }: { challenge: Challenge }) {
  useKeepAwake();
  const router = useRouter();
  const camera = useRef<CameraRef>(null);
  // Per-frame data: written from each detector result, read on the UI thread by Skia and the gauge.
  const joints = useSharedValue<(SkPoint | null)[]>([]);
  const filter = useRef<JointFilter | null>(null);
  const highlight = useSharedValue<readonly [number, number, number] | null>(null);
  const angle = useSharedValue<number | null>(null);
  const lowest = useSharedValue<number | null>(null);
  // Video only: no audio, so no microphone permission.
  const video = useVideoOutput({ targetResolution: CommonResolutions.HD_16_9, enableAudio: false });
  const session = useActorRef(workoutSession, {
    input: {
      challenge,
      video,
      record: __DEV__,
      onPose: (result, live) => {
        // Read at call time: the window turns when the orientation lock lands.
        const { width, height } = Dimensions.get('window');
        const view = toViewJoints(camera.current, result);
        const smoothed = filterJoints(
          filter.current,
          view,
          result.timestampMs / 1000,
          Math.hypot(width, height),
        );
        filter.current = smoothed.state;
        joints.set(smoothed.points);
        highlight.set(live.joints);
        angle.set(live.angle);
        lowest.set(live.lowest);
      },
    },
  });
  const landmarker = useSelector(session, (s) => s.context.landmarker);
  // Only discrete counter changes re-render; per-frame data stays out of React state.
  const view = useSelector(session, sessionView, shallowEqual);
  // The orientation lock lands asynchronously; lay out from the real window.
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  // System back pauses counting or countdown, then ends (to Done, results kept).
  usePreventRemove(view.stage !== 'finished', () =>
    session.send({
      type: view.stage === 'counting' || view.stage === 'countdown' ? 'pause' : 'end',
    }),
  );

  const send =
    (
      type:
        | 'pause'
        | 'resume'
        | 'restart'
        | 'end'
        | 'next'
        | 'toggleVoice'
        | 'toggleSkeleton'
        | 'flipCamera'
        | 'cameraReady'
        | 'videoLost',
    ) =>
    () =>
      session.send({ type });
  const tone = view.phase === 'waiting' ? 'idle' : view.flash === 'noRep' ? 'noRep' : 'live';

  return (
    <View className="flex-1 bg-ground">
      <StatusBar hidden />
      <PoseCamera
        cameraRef={camera}
        landmarker={landmarker}
        isActive={view.stage !== 'finished'}
        joints={joints}
        highlight={highlight}
        tone={tone}
        video={video}
        camera={view.camera}
        showSkeleton={view.skeleton}
        onReady={send('cameraReady')}
        onVideoLost={send('videoLost')}
      />
      {view.stage === 'finished' ? (
        <ChallengeDone view={view} title={challenge.name} onClose={() => router.back()} />
      ) : view.stage === 'switching' || view.stage === 'resting' ? (
        <BetweenSets
          view={view}
          landscape={landscape}
          onContinue={send('next')}
          onEnd={send('end')}
        />
      ) : (
        <LiveView
          view={view}
          landscape={landscape}
          angle={angle}
          lowest={lowest}
          onPause={send('pause')}
          onEndSet={send('next')}
          onResume={send('resume')}
          onRestart={send('restart')}
          onEnd={send('end')}
          onToggleVoice={send('toggleVoice')}
          onToggleSkeleton={send('toggleSkeleton')}
          onFlipCamera={send('flipCamera')}
        />
      )}
    </View>
  );
}
