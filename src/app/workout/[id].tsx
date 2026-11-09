import { shallowEqual, useActorRef, useSelector } from '@xstate/react';
import { uuid } from 'expo';
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
import { ChallengeDone } from '@/challenges/components/challenge-done';
import { saveFailed } from '@/components/save-failed';
import { useLibrary } from '@/challenges/library-live';
import { sessionChallenge, type Library } from '@/challenges/library-view';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { today } from '@/workout/day';
import { RecoverOpenWorkout } from '@/workout/components/recover-prompt';
import { useLeftWorkout } from '@/workout/open-workout';
import type { Challenge } from '@/workout/plan';
import { BetweenSets } from '@/workout/components/between-sets';
import { LiveView } from '@/workout/components/live-view';
import { useSlidIn } from '@/workout/components/slid-in';
import { PrimaryButton } from '@/components/primary-button';
import { workoutLog, type LogTarget } from '@/workout/log';
import { workoutSession } from '@/workout/session';
import { sessionView } from '@/workout/session-view';

function Centered({ text }: { text: string }) {
  return (
    <View className="flex-1 items-center justify-center bg-ground p-6">
      <Text className="text-center font-sans text-chalk">{text}</Text>
    </View>
  );
}

// The camera run for one of your runs: /workout/<run id>, or /workout/squat for one go (a free log).
export default function ChallengeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { hasPermission, canRequestPermission, requestPermission } = useCameraPermission();
  const library = useLibrary();
  // This page's workout, known before it starts, so a workout an earlier session left open is offered
  // back (Save or Discard) before this one starts, and this one's own rows never are.
  const [workoutId] = useState(() => uuid.v4());
  const left = useLeftWorkout(workoutId);
  const slidIn = useSlidIn();
  if (library.loading || left.loading) return <View className="flex-1 bg-ground" />;
  if (left.workout) {
    return (
      <View className="flex-1 bg-ground">
        <RecoverOpenWorkout key={left.workout.id} workoutId={left.workout.id} />
      </View>
    );
  }
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
  // The camera, detector and orientation lock start once the page is in: started mid-slide, they held
  // one frame of the slide for 150 ms.
  if (!slidIn) return <View className="flex-1 bg-ground" />;
  // A new id is a new session actor.
  return <SessionStart key={id} id={id} library={library} workoutId={workoutId} />;
}

/**
 * Decides once, as the session starts, what it runs and on which day: later changes (midnight on a run's
 * last day, an edit to the challenge) never swap the plan under a running session or close it.
 */
function SessionStart({
  id,
  library,
  workoutId,
}: {
  id: string;
  library: Library;
  workoutId: string;
}) {
  const [start] = useState(() => new Date());
  const [accepted] = useState(() => sessionChallenge(library, id, today(start)));
  if (!accepted.challenge) return <Centered text="No such challenge." />;
  return (
    <AndroidSession
      id={id}
      library={library}
      workoutId={workoutId}
      start={start}
      challenge={accepted.challenge}
      target={accepted.target}
    />
  );
}

/**
 * `challenge`, `target` and `start` were fixed when the session started. The day word on the Done page
 * stays live, on the session's own day: a set finished at 00:05 still belongs to yesterday.
 */
function AndroidSession({
  id,
  library,
  workoutId,
  start,
  challenge,
  target,
}: {
  id: string;
  library: Library;
  workoutId: string;
  start: Date;
  challenge: Challenge;
  target: LogTarget;
}) {
  useKeepAwake();
  const router = useRouter();
  // Leaving is allowed: Done went through, or you confirmed Discard.
  const [leaving, setLeaving] = useState(false);
  // Back from the Done page, waiting on the Discard dialog: how to carry on leaving.
  const [asking, setAsking] = useState<(() => void) | null>(null);
  const camera = useRef<CameraRef>(null);
  const { joints, highlight, angle, lowest, onPose } = usePoseOverlay(camera);
  // Video only: no audio, so no microphone permission.
  const video = useVideoOutput({ targetResolution: CommonResolutions.HD_16_9, enableAudio: false });
  // Each finished set is written as it ends; Done keeps the workout, leaving without it discards it.
  const session = useActorRef(
    workoutSession.provide({ actors: { log: workoutLog(target, start) } }),
    {
      input: {
        challenge,
        workoutId,
        video,
        record: true,
        onPose,
      },
    },
  );
  // The run with this session counted in as if it were Done: what the Done page says of the day.
  const { run } = sessionChallenge(library, id, today(start), {
    workoutId,
    versionId: target.versionId,
  });
  const landmarker = useSelector(session, (s) => s.context.landmarker);
  // Only discrete counter changes re-render; per-frame data stays out of React state.
  const view = useSelector(session, sessionView, shallowEqual);
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
  // The log answers at once: saved, or not (it keeps the sets and Done can be tapped again).
  const onDone = () => {
    session.send({ type: 'save' });
    if (!session.getSnapshot().context.saved) return saveFailed();
    setLeaving(true);
    allowLeave();
    router.back();
  };

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
      {/* Gone once every file is final (stopped, not unmounted, until then, so no take is cut short):
          a stopped camera's last frame showed through the Done page's video. */}
      {!(view.stage === 'finished' && view.final) && (
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
      )}
      {view.stage === 'finished' ? (
        <ChallengeDone
          view={view}
          challenge={challenge}
          run={run}
          onShare={(share) => session.send({ type: 'shareTraces', share })}
          onClose={onDone}
        />
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
      {asking && (
        <ConfirmDialog
          title="Discard this workout?"
          text="What you counted in it isn't kept."
          action="Discard"
          onConfirm={() => {
            setAsking(null);
            // The log answers at once; a failed Discard keeps you here, the workout still open.
            session.send({ type: 'discard' });
            if (!session.getSnapshot().context.discarded) return saveFailed();
            setLeaving(true);
            asking();
          }}
          onCancel={() => setAsking(null)}
        />
      )}
    </View>
  );
}
