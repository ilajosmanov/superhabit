import { EXERCISES, type ExerciseId } from '@/exercises/registry';
import { capitalise } from '@/lib/text';

import { defineChallenge, MAX } from '@/workout/plan/plan';

/**
 * The exercises we offer on their own, in tile order: what the surprise card draws from (each once, as
 * many as you can; route id = exercise id) and what a new challenge is built on.
 */
export const ONE_GO: readonly ExerciseId[] = [
  'pushup',
  'squat',
  'plank',
  'situp',
  'lunge',
  'glute-bridge',
  'jumping-jack',
  'leg-raise',
  'wall-sit',
  'side-plank',
  'burpee',
];

/** One go at an exercise, as many as you can: what the surprise card and a free log start. */
export const oneGo = (exercise: ExerciseId) =>
  defineChallenge({
    name: capitalise(EXERCISES[exercise].name),
    days: 1,
    restartOnMiss: false,
    dailyTotal: false,
    session: [{ steps: [{ exercise, goal: MAX }], rounds: 1 }],
  });
