import { modules } from '@/workout/__fixtures__/session';
import { sql } from 'drizzle-orm';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { archive, create, edit, join, leave, seed } from './library';
import {
  catalog,
  challengePage,
  dayLog,
  sessionChallenge,
  yourRuns,
  type Library,
} from './library-view';
import { SUGGESTED_CHALLENGES } from './suggested';
import { db, migrateDatabase } from '@/storage/__fixtures__/database';
import * as schema from '@/storage/schema';
import { addDays, today } from '@/lib/day';
import { logSet, saveWorkout, workoutStart } from '@/workout/store';
import { defineChallenge, readPlan, reps, type Challenge } from '@/workout/plan/plan';

vi.mock('expo-file-system', () => modules['expo-file-system']);
vi.mock('superhabit-gzip-file', () => modules['superhabit-gzip-file']);
vi.mock('@/storage/database', () => import('@/storage/__fixtures__/database'));
vi.mock('expo', () => ({ uuid: { v4: () => crypto.randomUUID() } }));
vi.mock('expo-constants', () => ({ default: { expoConfig: { version: '1.0.0' } } }));

const library = (): Library => ({
  account: { id: 'local', name: 'You', image: null },
  sharing: null,
  challenges: db().select().from(schema.challenges).all(),
  versions: db().select().from(schema.challengeVersions).all(),
  runs: db().select().from(schema.runs).all(),
  workouts: db().select().from(schema.workouts).all(),
  sets: db().select().from(schema.sets).all(),
});
const outbox = () =>
  db()
    .select()
    .from(schema.outbox)
    .all()
    .map(({ entity, entityId, op, payload }) => ({ entity, entityId, op, payload }));

/** Someone else's challenge with one version, `<id>-1`, whose plan may be from a newer app. */
function theirs(id: string, plan: unknown) {
  db()
    .insert(schema.challenges)
    .values({ id, owner: 'friend', visibility: 'public', currentVersionId: `${id}-1` })
    .run();
  addVersion(id, `${id}-1`, plan);
}
function addVersion(challengeId: string, id: string, plan: unknown) {
  db()
    .insert(schema.challengeVersions)
    .values({
      id,
      challengeId,
      number: 1,
      name: 'Their',
      days: 21,
      dailyTotal: false,
      restartOnMiss: false,
      plan,
      createdAt: 0,
    })
    .run();
}
/** A plan from a newer app: an exercise this one doesn't know. */
const NEWER = [{ steps: [{ exercise: 'handstand', goal: { type: 'reps', n: 5 } }], rounds: 1 }];

const squats = (days: number) =>
  defineChallenge({
    name: 'Squats',
    days,
    restartOnMiss: false,
    dailyTotal: false,
    session: [{ steps: [{ exercise: 'squat', goal: reps(20) }], rounds: 1 }],
  });
const [floor] = SUGGESTED_CHALLENGES;

beforeAll(migrateDatabase);
beforeEach(() => {
  // Noon, so a run never straddles midnight.
  vi.useFakeTimers({ now: new Date(2026, 10, 11, 12) });
  for (const table of [
    schema.sets,
    schema.workouts,
    schema.runs,
    schema.challengeVersions,
    schema.challenges,
    schema.outbox,
  ])
    db().delete(table).run();
  seed();
});
afterEach(() => vi.useRealTimers());

describe('seed', () => {
  it('stores every suggested challenge so this app can read it back, and changes nothing the second time', () => {
    const { challenges, versions } = library();
    expect(challenges.map(({ id }) => id)).toEqual(SUGGESTED_CHALLENGES.map(({ id }) => id));
    for (const { id, versionId, challenge } of SUGGESTED_CHALLENGES) {
      const version = versions.find((v) => v.id === versionId);
      expect(version?.challengeId).toBe(id);
      expect(readPlan(version?.plan)).toEqual(challenge.session);
    }

    seed();

    expect(library().challenges).toEqual(challenges);
    expect(library().versions).toEqual(versions);
    expect(outbox()).toEqual([]);
  });

  it('adds a changed suggestion as a new current version; a run pinned to the old one keeps it', () => {
    const pinned = join(floor.id);
    const original = { ...floor };
    Object.assign(floor, { versionId: 'floor-v2', challenge: { ...floor.challenge, days: 21 } });
    try {
      seed();
    } finally {
      Object.assign(floor, original);
    }

    const { versions, challenges } = library();
    expect(versions.filter((v) => v.challengeId === floor.id).map((v) => v.number)).toEqual([1, 2]);
    expect(challenges.find((c) => c.id === floor.id)?.currentVersionId).toBe('floor-v2');
    const [run] = yourRuns(library(), today());
    expect(run.runId).toBe(pinned);
    expect(run.challenge).toMatchObject({ id: floor.versionId, days: 14 });
    expect(challengePage(library(), floor.id, today())?.joined?.run.days).toBe(14);
  });
});

describe('writes', () => {
  it('archives all runs permanently while keeping the challenge details and workout history', () => {
    const id =
      create({
        ...squats(21),
        name: 'Morning push-ups',
        session: [{ steps: [{ exercise: 'pushup', goal: reps(20) }], rounds: 1 }],
      }) ?? '';
    const [{ runId }] = yourRuns(library(), today());
    const other = join(id) ?? '';
    const versionId = library().challenges.find((c) => c.id === id)?.currentVersionId ?? '';
    pushups(runId, versionId, 20);
    const history = library();

    expect(archive(id)).toBe(id);

    expect(yourRuns(library(), today())).toEqual([]);
    expect(catalog(library(), []).some((entry) => entry.id === id)).toBe(false);
    expect(challengePage(library(), id, today(), runId)).toMatchObject({
      name: 'Morning push-ups',
      archived: true,
      archivable: false,
      editable: false,
      challenge: { id: versionId, days: 21 },
      joined: null,
      runId: null,
      status: 'ARCHIVED',
    });
    for (const run of [runId, other]) {
      expect(sessionChallenge(library(), run, today()).challenge).toBeNull();
    }
    expect(library()).toMatchObject({
      runs: history.runs,
      workouts: history.workouts,
      sets: history.sets,
      versions: history.versions,
    });
    expect(dayLog(library(), today(), today())).toMatchObject([
      { name: 'Morning push-ups', reps: 20, runDay: { number: 1, of: 21 }, free: false },
    ]);
    expect(outbox().at(-1)).toMatchObject({
      entity: 'challenge',
      entityId: id,
      op: 'archive',
      payload: { retiredAt: Date.now() },
    });

    const kept = library();
    const queued = outbox();
    expect(join(id)).toBeNull();
    expect(edit(id, squats(30))).toBeNull();
    vi.setSystemTime(new Date(2026, 10, 12, 12));
    expect(archive(id)).toBe(id);
    expect(library()).toEqual(kept);
    expect(outbox()).toEqual(queued);
  });

  it('runs a challenge twice side by side, each with its own page, and leaves the one you pick', () => {
    const first = join(floor.id) ?? '';
    const second = join(floor.id) ?? '';
    expect(yourRuns(library(), today()).map(({ runId }) => runId)).toEqual([first, second]);
    expect(challengePage(library(), floor.id, today(), first)?.runId).toBe(first);
    expect(challengePage(library(), floor.id, today(), second)?.runId).toBe(second);

    leave(first);

    expect(yourRuns(library(), today()).map(({ runId }) => runId)).toEqual([second]);
    // A link to the run you left shows it as over, never the other run.
    expect(challengePage(library(), floor.id, today(), first)?.runId).toBeNull();
    expect(challengePage(library(), floor.id, today())?.runId).toBe(second);
    expect(library().runs.find(({ id }) => id === first)).toMatchObject({
      endedOn: today(),
      endReason: 'left',
    });
  });

  it('keeps a challenge you made in the catalog once you leave it, to join again', () => {
    const id = create(squats(21)) ?? '';
    const [{ runId }] = yourRuns(library(), today());
    expect(catalog(library(), yourRuns(library(), today())).map((entry) => entry.id)).not.toContain(
      id,
    );

    leave(runId);

    const listed = catalog(library(), yourRuns(library(), today())).map((entry) => entry.id);
    expect(listed.at(-1)).toBe(id);
    expect(challengePage(library(), id, today())).toMatchObject({ joined: null, ranBefore: true });
    const again = join(id) ?? '';
    expect(yourRuns(library(), today()).map((entry) => entry.runId)).toEqual([again]);
  });

  it('makes your edit current, and your run follows it unpinned', () => {
    const id = create(squats(21)) ?? '';
    const versionId = edit(id, squats(30));

    const [run] = yourRuns(library(), today());
    expect(run.challengeId).toBe(id);
    expect(run.challenge).toMatchObject({ id: versionId, days: 30 });
    expect(library().runs[0].pinnedVersionId).toBeNull();
    expect(
      library()
        .versions.filter((v) => v.challengeId === id)
        .map((v) => v.number),
    ).toEqual([1, 2]);
  });

  it('lets you edit only a one-exercise challenge you made', () => {
    const id = create(squats(21)) ?? '';
    expect(challengePage(library(), id, today())?.editable).toBe(true);
    theirs('theirs', squats(21).session); // the same plan, someone else's
    expect(challengePage(library(), 'theirs', today())?.editable).toBe(false);
    expect(challengePage(library(), floor.id, today())?.editable).toBe(false);
  });

  it('queues each write for the server once, in a versioned envelope', () => {
    const id = create(squats(21)) ?? '';
    const [{ runId: own }] = yourRuns(library(), today());
    const joined = join(floor.id) ?? '';
    leave(joined);
    edit(id, squats(30));

    expect(outbox().map(({ entity, entityId, op }) => [entity, entityId, op])).toEqual([
      ['challenge', id, 'create'],
      ['run', own, 'join'],
      ['run', joined, 'join'],
      ['run', joined, 'leave'],
      ['challenge', id, 'edit'],
    ]);
  });

  it('writes neither the change nor its outbox row when the outbox write fails', () => {
    const id = create(squats(21)) ?? '';
    const before = library();
    const queued = outbox();
    db().run(
      sql`create trigger full before insert on outbox begin select raise(abort, 'disk full'); end`,
    );
    try {
      expect(join(floor.id)).toBeNull();
      expect(create(squats(21))).toBeNull();
      expect(archive(id)).toBeNull();
    } finally {
      db().run(sql`drop trigger full`);
    }
    expect(library()).toEqual(before);
    expect(outbox()).toEqual(queued);
  });

  it("won't edit or archive a challenge that isn't yours", () => {
    theirs('theirs', squats(21).session);
    const before = library();
    expect(edit(floor.id, squats(30))).toBeNull();
    for (const id of [floor.id, 'theirs', 'missing']) expect(archive(id)).toBeNull();
    expect(library()).toEqual(before);
    expect(outbox()).toEqual([]);
  });
});

describe('a plan from a newer app', () => {
  it("can't be joined; nothing is written", () => {
    theirs('newer', NEWER);
    expect(join('newer')).toBeNull();
    expect(library().runs).toEqual([]);
    expect(outbox()).toEqual([]);
  });

  it('keeps a run on it as one to update the app for, never shown with another version', () => {
    theirs('newer', squats(21).session);
    const runId = join('newer') ?? '';
    addVersion('newer', 'newer-2', NEWER);
    db().update(schema.runs).set({ pinnedVersionId: 'newer-2' }).run();

    expect(yourRuns(library(), today())).toEqual([
      { challengeId: 'newer', runId, name: 'Their', challenge: null },
    ]);
    expect(challengePage(library(), 'newer', today(), runId)).toMatchObject({
      runId,
      challenge: null,
      joined: null,
    });
  });
});

describe('a daily total', () => {
  it("adds up the run's own done workouts that day, leaving out other runs and free logs", () => {
    const id =
      create({
        ...squats(30),
        dailyTotal: true,
        session: [{ steps: [{ exercise: 'pushup', goal: reps(500) }], rounds: 1 }],
      }) ?? '';
    const [{ runId }] = yourRuns(library(), today());
    const other = join(id) ?? '';
    const versionId = library().challenges.find((c) => c.id === id)?.currentVersionId ?? '';
    pushups(runId, versionId, 250);
    pushups(runId, versionId, 250);
    pushups(other, versionId, 300);
    pushups(null, null, 400);

    const mine = yourRuns(library(), today()).find((entry) => entry.runId === runId);
    expect(mine?.challenge && mine.amounts.at(-1)?.done).toEqual([500]);
    expect(mine?.challenge && mine.run.progress.at(-1)).toBe(1);
  });

  it('shows a day done before an edit raised the target against the target it was done for', () => {
    const daily = (n: number): Challenge => ({
      ...squats(30),
      dailyTotal: true,
      session: [{ steps: [{ exercise: 'pushup', goal: reps(n) }], rounds: 1 }],
    });
    const id = create(daily(500)) ?? '';
    const [{ runId }] = yourRuns(library(), today());
    pushups(runId, library().challenges.find((c) => c.id === id)?.currentVersionId ?? '', 500);

    edit(id, daily(1000));

    const [mine] = yourRuns(library(), today());
    expect(mine.challenge && mine.run.progress.at(-1)).toBe(1);
    // The day shows 500 against the 500 it was done for, not against the new 1000.
    expect(mine.challenge && mine.amounts.at(-1)).toMatchObject({
      version: { session: daily(500).session },
      done: [500],
    });
  });
});

describe('restart on miss', () => {
  it('shows the stretch from the day after the last miss', () => {
    const id =
      create({
        ...squats(5),
        restartOnMiss: true,
        session: [{ steps: [{ exercise: 'pushup', goal: reps(20) }], rounds: 1 }],
      }) ?? '';
    const [{ runId }] = yourRuns(library(), today());
    // Joined two days ago, missed that day, did the next one.
    db()
      .update(schema.runs)
      .set({ startedOn: addDays(today(), -2) })
      .run();
    const versionId = library().challenges.find((c) => c.id === id)?.currentVersionId ?? '';
    pushups(runId, versionId, 20, noonDaysAgo(1));

    const restarted = { from: addDays(today(), -1), day: 2, days: 5, progress: [1, 0] };
    const [mine] = yourRuns(library(), today());
    expect(mine.challenge && mine.run).toMatchObject(restarted);
    expect(challengePage(library(), id, today())?.joined?.run).toMatchObject(restarted);
  });
});

const noonDaysAgo = (n: number) => {
  const at = new Date();
  at.setDate(at.getDate() - n);
  at.setHours(12, 0, 0, 0);
  return at;
};

/** A done workout of `n` push-ups toward `runId`, through the workout log, started `at`. */
function pushups(runId: string | null, versionId: string | null, n: number, at = new Date()) {
  const workoutId = crypto.randomUUID();
  logSet(workoutStart(workoutId, { runId, versionId }, at), {
    id: crypto.randomUUID(),
    workoutId,
    planStep: 0,
    counterVersion: '1.0.0',
    exercise: 'pushup',
    round: 1,
    startedAt: 0,
    endedAt: 1,
    goal: reps(500),
    reps: n,
    noReps: 0,
    heldMs: 0,
    attempts: [],
    takes: [],
    stats: null,
  });
  saveWorkout(workoutId);
}
