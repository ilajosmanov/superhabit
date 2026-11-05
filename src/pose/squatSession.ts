import { createPoseLandmarker, type PoseDetection, type PoseLandmarker } from 'superhabit-pose';
import { assign, enqueueActions, fromCallback, sendTo, setup } from 'xstate';

import { repPhrase } from '@/feedback/phrase';
import { speech } from '@/feedback/speech';

import { initialSquat, legAngles, measure, stepSquat, type Pose, type SquatState } from './squat';

type Events =
  | { type: 'ready'; landmarker: PoseLandmarker }
  | { type: 'pose'; result: PoseDetection }
  | { type: 'reset' };

type Context = { landmarker: PoseLandmarker | null; squat: SquatState };

/** Owns the native detector for as long as the session runs. */
const landmarker = fromCallback<Events>(({ sendBack }) => {
  const instance = createPoseLandmarker();
  sendBack({ type: 'ready', landmarker: instance });
  return () => instance.close();
});

type Actors = { landmarker: typeof landmarker; speech: typeof speech };

/** One squat session: detector and speech lifecycles, plus the rep counter fed by pose results. */
export const squatSession = setup<Context, Events, Actors>({
  actors: { landmarker, speech },
}).createMachine({
  context: { landmarker: null, squat: initialSquat },
  invoke: [{ src: 'landmarker' }, { src: 'speech', id: 'speech' }],
  on: {
    ready: { actions: assign({ landmarker: ({ event }) => event.landmarker }) },
    pose: {
      // stepSquat advances a stateful filter, so it runs exactly once per result, never in render.
      actions: enqueueActions(({ context, event, enqueue }) => {
        const pose: Pose = { image: event.result.landmarks, world: event.result.worldLandmarks };
        const prev = context.squat;
        const squat = stepSquat(prev, measure(pose), event.result.timestampMs);
        enqueue.assign({ squat });
        const text = repPhrase(prev, squat, squat.lastRep?.cues);
        if (text) enqueue(sendTo('speech', { type: 'say', text }));
        // Spike debug: read with `adb logcat -s ReactNativeJS`.
        if (prev.phase !== 'down' && squat.phase === 'down') {
          const legs = legAngles(pose)?.map(Math.round);
          console.log('[squat] DOWN', legs, JSON.stringify(pose.world.slice(23, 29)));
        }
      }),
    },
    reset: { actions: assign({ squat: initialSquat }) },
  },
});
