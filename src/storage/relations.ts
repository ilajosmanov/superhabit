import { defineRelations } from 'drizzle-orm';

import * as schema from './schema';

/** How the tables join, so a feature can read with `db.query.<table>.findMany({ with })`. */
export const relations = defineRelations(schema, (r) => ({
  challenges: {
    versions: r.many.challengeVersions(),
    current: r.one.challengeVersions({
      from: r.challenges.currentVersionId,
      to: r.challengeVersions.id,
    }),
    runs: r.many.runs(),
  },
  challengeVersions: {
    challenge: r.one.challenges({ from: r.challengeVersions.challengeId, to: r.challenges.id }),
  },
  runs: {
    challenge: r.one.challenges({ from: r.runs.challengeId, to: r.challenges.id }),
    pinnedVersion: r.one.challengeVersions({
      from: r.runs.pinnedVersionId,
      to: r.challengeVersions.id,
    }),
    workouts: r.many.workouts(),
  },
  workouts: {
    run: r.one.runs({ from: r.workouts.runId, to: r.runs.id }),
    version: r.one.challengeVersions({ from: r.workouts.versionId, to: r.challengeVersions.id }),
    sets: r.many.sets(),
  },
  sets: {
    workout: r.one.workouts({ from: r.sets.workoutId, to: r.workouts.id }),
  },
}));
