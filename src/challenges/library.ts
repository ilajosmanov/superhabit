import { eq } from 'drizzle-orm';
import { uuid } from 'expo';

import { OURS, SUGGESTED_CHALLENGES, SUGGESTED_HISTORY } from './suggested';
import { userId } from '@/storage/account';
import { db, type Transaction } from '@/storage/database';
import { enqueue } from '@/storage/outbox';
import { challenges, challengeVersions, runs } from '@/storage/schema';
import { today } from '@/lib/day';
import {
  defineChallenge,
  readChallengePlan,
  storedPlan,
  type Challenge,
} from '@/workout/plan/plan';

/** Whole tables for the library's live subscriptions. */
export const challengeRows = () => db().query.challenges.findMany();
export const versionRows = () => db().query.challengeVersions.findMany();
export const runRows = () => db().query.runs.findMany();

/** A challenge's content as a version row; versions are only ever added. */
const versionRow = (challengeId: string, id: string, number: number, challenge: Challenge) => ({
  id,
  challengeId,
  number,
  name: challenge.name,
  days: challenge.days,
  dailyTotal: challenge.dailyTotal,
  restartOnMiss: challenge.restartOnMiss,
  plan: storedPlan(defineChallenge(challenge)),
  createdAt: Date.now(),
});

const versionsOf = (tx: Transaction, challengeId: string) =>
  tx.query.challengeVersions.findMany({ where: { challengeId } }).sync();

/**
 * Ours into the database at every start: a missing challenge or version is added and made current.
 * Running it again changes nothing. Not queued for the server: it ships them itself.
 */
export function seed() {
  db().transaction((tx) => {
    for (const { id, versionId, challenge } of SUGGESTED_CHALLENGES) {
      tx.insert(challenges)
        .values({ id, owner: OURS, visibility: 'public', currentVersionId: versionId })
        .onConflictDoNothing()
        .run();
      for (const entry of [
        ...SUGGESTED_HISTORY.filter((entry) => entry.id === id),
        { id, versionId, challenge },
      ]) {
        const versions = versionsOf(tx, id);
        if (!versions.some((version) => version.id === entry.versionId)) {
          tx.insert(challengeVersions)
            .values(versionRow(id, entry.versionId, versions.length + 1, entry.challenge))
            .run();
        }
      }
      tx.update(challenges).set({ currentVersionId: versionId }).where(eq(challenges.id, id)).run();
    }
  });
}

// Every change below is one transaction with its outbox row, and returns null, with nothing written,
// when the phone can't write it. Each returns the id it wrote.
function write(change: (tx: Transaction) => string): string | null {
  try {
    return db().transaction(change);
  } catch (error) {
    console.warn('[library] write failed', error);
    return null;
  }
}

/**
 * A run from today. Someone else's challenge (ours too) is pinned to its version now; yours follows edits.
 * A version this app can't run (from a newer app) can't be joined.
 */
function joinIn(tx: Transaction, challengeId: string) {
  const challenge = tx.query.challenges
    .findFirst({ where: { id: challengeId }, with: { current: true } })
    .sync();
  if (!challenge) throw new Error(`No challenge ${challengeId}`);
  if (challenge.retiredAt !== null) throw new Error(`${challengeId} is archived`);
  const plan = readChallengePlan(challenge.current?.plan, challenge.current?.days ?? 0);
  if (!plan) throw new Error(`Can't run ${challengeId}: update the app`);
  const run = {
    id: uuid.v4(),
    challengeId,
    pinnedVersionId:
      challenge.owner === userId() && !plan.schedule ? null : challenge.currentVersionId,
    groupChallengeId: null,
    startedOn: today(),
    endedOn: null,
    endReason: null,
  };
  tx.insert(runs).values(run).run();
  enqueue(tx, { entity: 'run', entityId: run.id, op: 'join', data: run });
  return run.id;
}

/** Join from today; joining again starts another run beside the first. The new run's id. */
export const join = (challengeId: string) => write((tx) => joinIn(tx, challengeId));

/** Stop a run today. Its days stay. */
export const leave = (runId: string) =>
  write((tx) => {
    const end = { endedOn: today(), endReason: 'left' as const };
    tx.update(runs).set(end).where(eq(runs.id, runId)).run();
    enqueue(tx, { entity: 'run', entityId: runId, op: 'leave', data: end });
    return runId;
  });

/** A challenge you made, private, joined from today. Its id. */
export const create = (challenge: Challenge) =>
  write((tx) => {
    const id = uuid.v4();
    const version = versionRow(id, uuid.v4(), 1, challenge);
    const row = {
      id,
      owner: userId(),
      visibility: 'private' as const,
      currentVersionId: version.id,
    };
    tx.insert(challenges).values(row).run();
    tx.insert(challengeVersions).values(version).run();
    enqueue(tx, { entity: 'challenge', entityId: id, op: 'create', data: { ...row, version } });
    joinIn(tx, id);
    return id;
  });

/**
 * New content for a challenge you made: a new version, current from now; runs that follow it see it next
 * workout. Anyone else's (ours too) can't be edited.
 */
export const edit = (challengeId: string, challenge: Challenge) =>
  write((tx) => {
    const row = tx.query.challenges.findFirst({ where: { id: challengeId } }).sync();
    if (row?.owner !== userId()) throw new Error(`${challengeId} isn't yours to edit`);
    if (row.retiredAt !== null) throw new Error(`${challengeId} is archived`);
    const versions = versionsOf(tx, challengeId);
    if (challenge.schedule && versions.some((v) => !readChallengePlan(v.plan, v.days)?.schedule)) {
      throw new Error('Create a new challenge to add a calendar to a daily plan');
    }
    const number = Math.max(0, ...versions.map((v) => v.number)) + 1;
    const version = versionRow(challengeId, uuid.v4(), number, challenge);
    tx.insert(challengeVersions).values(version).run();
    tx.update(challenges)
      .set({ currentVersionId: version.id })
      .where(eq(challenges.id, challengeId))
      .run();
    enqueue(tx, { entity: 'challenge', entityId: challengeId, op: 'edit', data: { version } });
    return version.id;
  });

/** Permanently archive your challenge. Its runs and workouts stay as history. */
export const archive = (challengeId: string) =>
  write((tx) => {
    const row = tx.query.challenges.findFirst({ where: { id: challengeId } }).sync();
    if (row?.owner !== userId()) throw new Error(`${challengeId} isn't yours to archive`);
    if (row.retiredAt !== null) return challengeId;
    const retiredAt = Date.now();
    tx.update(challenges).set({ retiredAt }).where(eq(challenges.id, challengeId)).run();
    enqueue(tx, { entity: 'challenge', entityId: challengeId, op: 'archive', data: { retiredAt } });
    return challengeId;
  });
