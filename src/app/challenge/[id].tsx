import type { SkPoint } from '@shopify/react-native-skia';
import { shallowEqual, useActorRef, useSelector } from '@xstate/react';
import { useLocalSearchParams } from 'expo-router';
import { useRef } from 'react';
import { Platform, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useCameraPermission, type CameraRef } from 'react-native-vision-camera';

import { BetweenSets } from '@/components/between-sets';
import { PoseCamera, toViewPoints } from '@/components/pose-camera';
import { SetPanel } from '@/components/set-panel';
import { CHALLENGES, type Challenge } from '@/workout/challenges';
import { sessionView, workoutSession } from '@/workout/session';

function Centered({ text }: { text: string }) {
  return (
    <View className="flex-1 items-center justify-center bg-ground p-6">
      <Text className="text-center font-sans text-chalk">{text}</Text>
    </View>
  );
}

// One route for every challenge: /challenge/squat, /challenge/pushup, /challenge/squat-pushup.
export default function ChallengeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const challenge = CHALLENGES.get(id);
  if (!challenge) return <Centered text="No such challenge." />;
  if (Platform.OS !== 'android') return <Centered text="Pose tracking is available on Android." />;
  // A new id is a new session actor.
  return <AndroidSession key={id} challenge={challenge} />;
}

function AndroidSession({ challenge }: { challenge: Challenge }) {
  const { hasPermission, requestPermission } = useCameraPermission();
  const camera = useRef<CameraRef>(null);
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
      <PoseCamera
        cameraRef={camera}
        landmarker={landmarker}
        dots={dots}
        isActive={view.stage !== 'finished'}
        landscape={landscape}
      />
      {view.stage === 'switching' ? (
        <BetweenSets
          view={view}
          landscape={landscape}
          onContinue={() => session.send({ type: 'next' })}
        />
      ) : (
        <SetPanel
          view={view}
          landscape={landscape}
          onReset={() => session.send({ type: 'reset' })}
          onEndSet={() => session.send({ type: 'next' })}
        />
      )}
    </View>
  );
}
