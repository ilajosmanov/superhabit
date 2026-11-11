import { shallowEqual, useActorRef, useSelector } from '@xstate/react';
import { uuid } from 'expo';
import { usePreventRemove } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState, type ReactNode } from 'react';
import { Linking, Platform, Text, useWindowDimensions, View } from 'react-native';
import {
  CommonResolutions,
  useCameraPermission,
  useVideoOutput,
  type CameraRef,
} from 'react-native-vision-camera';

import { BetweenSets } from './between-sets';
import { CameraPermission } from './camera-permission';
import { LiveView } from './live-view';
import { RecoverOpenWorkout } from './recover-prompt';
import { RestView } from './rest-view';
import { useSlidIn } from './slid-in';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { saveFailed } from '@/components/save-failed';
import type { LogTarget } from '@/workout/store';
import type { Challenge } from '@/workout/plan/plan';
import { usePoseOverlay } from '@/workout/pose/overlay';
import { PoseCamera } from '@/workout/pose/pose-camera';
import { workoutSession } from '@/workout/session/session';
import { sessionView, type SessionView } from '@/workout/session/session-view';

function Centered({ text }: { text: string }) {
  return (
    <View className="flex-1 items-center justify-center bg-ground p-6">
      <Text className="text-center font-sans text-chalk">{text}</Text>
    </View>
  );
}

/**
 * What is settled before a workout starts: a workout an earlier session left open is offered back (Save
 * or Discard), the camera is allowed, and the page has slid in. `children` gets this workout's id, known
 * before it starts, so its own open workout is never offered back. `waiting`: the shared tables still show
 * the workout startup's prompt is offering back; nothing starts until it is saved or discarded.
 */
export function SessionGate({
  openWorkout,
  waiting = false,
  children,
  onLeave,
}: {
  onLeave: () => void;
  openWorkout: { id: string } | null;
  waiting?: boolean;
  children: (workoutId: string) => ReactNode;
}) {
  const { hasPermission, canRequestPermission, requestPermission } = useCameraPermission();
  const [workoutId] = useState(() => uuid.v4());
  const left = openWorkout?.id !== workoutId ? openWorkout : null;
  const slidIn = useSlidIn();
  // After useSlidIn, so the slide is still caught while it waits.
  if (waiting) return <View className="flex-1 bg-ground" />;
  if (left) {
    return (
      <View className="flex-1 bg-ground">
        <RecoverOpenWorkout key={left.id} workoutId={left.id} />
      </View>
    );
  }
  if (Platform.OS !== 'android') return <Centered text="Pose tracking is available on Android." />;
  // Before the session: its clock and orientation lock would run during the prompt.
  if (!hasPermission) {
    return (
      // Once denied for good (Android's 'denied'), only Settings can grant it.
      <CameraPermission
        onLeave={onLeave}
        canAsk={canRequestPermission}
        onAsk={() => void (canRequestPermission ? requestPermission() : Linking.openSettings())}
      />
    );
  }
  // The camera, detector and orientation lock start once the page is in: started mid-slide, they held
  // one frame of the slide for 150 ms.
  if (!slidIn) return <View className="flex-1 bg-ground" />;
  return children(workoutId);
}

type Props = {
  workoutId: string;
  /** What the session runs, fixed as it started; null when there is nothing to run. */
  challenge: Challenge | null;
  target: LogTarget;
  start: Date;
  /** The Done page: `onClose` is Done. */
  done: (page: { view: SessionView; challenge: Challenge; onClose: () => void }) => ReactNode;
  /** Leaves the page, once the workout is saved. */
  onLeave: () => void;
};

/** The camera session, counting toward `target`; each set is kept as it finishes. */
export function SessionScreen({ challenge, ...props }: Props) {
  if (!challenge) return <Centered text="No such challenge." />;
  return <Session challenge={challenge} {...props} />;
}

function Session({
  workoutId,
  challenge,
  target,
  start,
  done,
  onLeave,
}: Props & { challenge: Challenge }) {
  // Back from the Done page, waiting on the Discard dialog: how to carry on leaving.
  const [asking, setAsking] = useState<(() => void) | null>(null);
  const camera = useRef<CameraRef>(null);
  const { joints, highlight, angle, lowest, onPose } = usePoseOverlay(camera);
  // Video only: no audio, so no microphone permission.
  // 2.5 Mbps: about 19 MB a minute of 720p.
  const video = useVideoOutput({
    targetResolution: CommonResolutions.HD_16_9,
    targetBitRate: 2_500_000,
    enableAudio: false,
  });
  // Done keeps the workout; leaving without it discards it.
  const session = useActorRef(workoutSession, {
    input: { challenge, workoutId, target, start, video, onPose, onFailure: saveFailed },
  });
  const landmarker = useSelector(session, (s) => s.context.landmarker);
  // Only discrete counter changes re-render; per-frame data stays out of React state.
  const view = useSelector(session, sessionView, shallowEqual);
  const leaving = view.left;
  // The orientation lock lands asynchronously; lay out from the real window.
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  // System back pauses counting or countdown; a second back from the pause ends (to Done, results
  // kept). Between sets it does nothing: a stray edge swipe while moving the phone must not end the
  // day, and the screen's own close button ends it on purpose. Back from the Done page asks before
  // discarding what was counted. Leaving turns prevention off in the same handler, as the hook asks.
  const allowLeave = usePreventRemove(
    !leaving && (view.stage !== 'finished' || view.counted),
    ({ repeat }) => {
      if (view.stage === 'counting' || view.stage === 'countdown') session.send({ type: 'pause' });
      else if (view.stage === 'paused') session.send({ type: 'end' });
      else if (view.stage === 'finished') setAsking(() => repeat);
    },
  );
  const onDone = () =>
    session.send({
      type: 'save',
      onLeave: () => {
        allowLeave();
        onLeave();
      },
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
        | 'videoLost'
        | 'cameraFailed',
    ) =>
    () =>
      session.send({ type });
  const tone = view.phase === 'waiting' ? 'idle' : view.flash === 'noRep' ? 'noRep' : 'live';

  return (
    <View className="flex-1 bg-ground">
      <StatusBar hidden />
      {/* Gone once every file is final (stopped, not unmounted, until then, so no take is cut short):
          a stopped camera's last frame showed through the Done page's video. */}
      {!(view.stage === 'finished' && view.final) && (
        <PoseCamera
          // A camera retry mounts it afresh.
          key={view.cameraTry}
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
          onCameraFailed={send('cameraFailed')}
        />
      )}
      {view.stage === 'finished' ? (
        done({
          view,
          challenge,
          onClose: onDone,
        })
      ) : view.stage === 'resting' ? (
        <RestView view={view} landscape={landscape} onContinue={send('next')} onEnd={send('end')} />
      ) : view.stage === 'switching' ? (
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
      {asking && (
        <ConfirmDialog
          title="Discard this workout?"
          text="What you counted in it isn't kept."
          action="Discard"
          onConfirm={() => {
            setAsking(null);
            session.send({ type: 'discard', onLeave: asking });
          }}
          onCancel={() => setAsking(null)}
        />
      )}
    </View>
  );
}
