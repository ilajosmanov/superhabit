import { EXERCISES, type ExerciseId } from '@/exercises/registry';

/** A timed hold (plank, wall sit): what it gets is seconds, not reps. */
export const isHold = (exercise: ExerciseId) => EXERCISES[exercise].kind === 'hold';
