import { shallowEqual, useActorRef, useSelector } from '@xstate/react';
import { useKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams, usePreventRemove, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import { Linking, Platform, Text, useWindowDimensions, View } from 'react-native';
import {
  CommonResolutions,
  useCameraPermission,
  useVideoOutput,
  type CameraRef,
} from 'react-native-vision-camera';

import { usePoseOverlay } from '@/workout/pose/overlay';
import { PoseCamera } from '@/workout/pose/pose-camera';
import { saveFailed } from '@/challenges/components/save-failed';
import { today, type Day } from '@/challenges/days';
import { markDone, useChallenge } from '@/challenges/mine';
import type { Challenge } from '@/workout/plan';
import { BetweenSets } from '@/workout/components/between-sets';
import { ChallengeDone } from '@/workout/components/challenge-done';
import { LiveView } from '@/workout/components/live-view';
import { PrimaryButton } from '@/components/primary-button';
import { workoutSession } from '@/workout/session';
import { sessionView } from '@/workout/session-view';

function Centered({ text }: { text: string }) {
  return (
    <View className="flex-1 items-center justify-center bg-ground p-6">
      <Text className="text-center font-sans text-chalk">{text}</Text>
    </View>
  );
}

// The camera run for a challenge: /workout/pushup-fifty, or /workout/squat for one go.
export default function ChallengeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { hasPermission, canRequestPermission, requestPermission } = useCameraPermission();
  const found = useChallenge(id);
  if (!found) return <Centered text="No such challenge." />;
  if (Platform.OS !== 'android') return <Centered text="Pose tracking is available on Android." />;
  // Before the session: its clock and orientation lock would run during the prompt.
  if (!hasPermission) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-ground p-6">
        <Text className="text-center font-sans text-chalk">
          Camera access is needed to count reps.
        </Text>
        {/* Once denied for good (Android's 'denied'), only Settings can grant it. */}
        <PrimaryButton
          onPress={() => void (canRequestPermission ? requestPermission() : Linking.openSettings())}
          label={canRequestPermission ? 'Allow camera' : 'Open settings'}
        />
      </View>
    );
  }
  // A new id is a new session actor.
  return (
    <AndroidSession
      key={id}
      challenge={found.challenge}
      // A day counts only when every set met its goal; a one-go set is never stored.
      onFinished={(met, day) => {
        if (met && found.saved && !markDone(id, day)) saveFailed();
      }}
    />
  );
}

function AndroidSession({
  challenge,
  onFinished,
}: {
  challenge: Challenge;
  /** `day` is the one the session started on: a set finished at 00:05 still belongs to yesterday. */
  onFinished: (metEveryGoal: boolean, day: Day) => void;
}) {
  useKeepAwake();
  const [day] = useState(today);
  const router = useRouter();
  const camera = useRef<CameraRef>(null);
  const { joints, highlight, angle, lowest, onPose } = usePoseOverlay(camera);
  // Video only: no audio, so no microphone permission.
  const video = useVideoOutput({ targetResolution: CommonResolutions.HD_16_9, enableAudio: false });
  const session = useActorRef(workoutSession, {
    input: { challenge, video, record: __DEV__, onPose, onFinished: (met) => onFinished(met, day) },
  });
  const landmarker = useSelector(session, (s) => s.context.landmarker);
  // Only discrete counter changes re-render; per-frame data stays out of React state.
  const view = useSelector(session, sessionView, shallowEqual);
  // The orientation lock lands asynchronously; lay out from the real window.
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  // System back pauses counting or countdown; a second back from the pause ends (to Done, results
  // kept). Between sets it does nothing: a stray edge swipe while moving the phone must not end the
  // day, and the screen's own close button ends it on purpose.
  usePreventRemove(view.stage !== 'finished', () => {
    if (view.stage === 'counting' || view.stage === 'countdown') session.send({ type: 'pause' });
    else if (view.stage === 'paused') session.send({ type: 'end' });
  });

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
        video={view.filming ? video : undefined}
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
