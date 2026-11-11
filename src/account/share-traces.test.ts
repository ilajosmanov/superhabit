import { Directory, File, Paths } from 'expo-file-system';
import { readdirSync, rmSync, writeFileSync } from 'node:fs';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { POLICY_VERSION, sharingNow } from './consent';
import { SessionGone } from './server';
import { shareTraces } from './share-traces';
import { db, migrateDatabase } from '@/storage/__fixtures__/database';
import { account } from '@/storage/account';
import { db as database } from '@/storage/database';
import { clearDatabase } from '@/storage/clear';
import { writeSharing } from '@/storage/consent';
import * as schema from '@/storage/schema';

// Our server is faked; the files are real, in a folder of their own, and so is SQLite.
const fake = vi.hoisted(() => ({
  upload: vi.fn<(url: string) => Promise<{ status: number; body: string }>>(),
  cookie: vi.fn(async () => 'session=1'),
}));
// `/me`: the server holds no consent (only asked after a 403).
vi.mock('./auth-client', () => ({
  authClient: {
    getCookie: fake.cookie,
    $fetch: async () => ({ data: { consents: [] }, error: null }),
  },
}));
vi.mock('expo-network', () => ({}));
vi.mock('@/storage/database', () => import('@/storage/__fixtures__/database'));
vi.mock('expo-file-system', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const os = await import('node:os');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'share-traces-'));
  class Directory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = path.join(...parts.map((part) => (typeof part === 'string' ? part : part.uri)));
    }
    get exists() {
      return fs.existsSync(this.uri);
    }
    create() {
      fs.mkdirSync(this.uri, { recursive: true });
    }
    list() {
      return fs.readdirSync(this.uri).map((name) => ({ name }));
    }
  }
  class File {
    uri: string;
    constructor(
      folder: Directory,
      private name: string,
    ) {
      this.uri = path.join(folder.uri, name);
    }
    move(to: Directory) {
      fs.renameSync(this.uri, path.join(to.uri, this.name));
    }
    upload(url: string) {
      return fake.upload(url);
    }
  }
  return { Directory, File, Paths: { document: new Directory(root) } };
});

const folder = (name: string) => new Directory(Paths.document, 'local', 'traces', name);
const files = (name: string) => (folder(name).exists ? readdirSync(folder(name).uri).sort() : []);
function record(name: string, ...setIds: string[]) {
  folder(name).create();
  for (const setId of setIds) writeFileSync(new File(folder(name), `${setId}.sht`).uri, 'trace');
}
/** The sets whose workout the server has (the workout feature decides; faked here). */
const onServer = new Set<string>();
const synced = (setId: string) => onServer.has(setId);
const share = (traces: boolean) =>
  database().transaction((tx) => writeSharing(tx, { traces, policyVersion: POLICY_VERSION }));
const uploaded = () =>
  fake.upload.mock.calls
    .map(([url]) => url.split('/').at(-1) ?? '')
    .sort((a, b) => a.localeCompare(b));

describe('sharing traces', () => {
  // The mock's temporary folder.
  afterAll(() => rmSync(Paths.document.uri, { recursive: true, force: true }));
  beforeEach(async () => {
    await migrateDatabase();
    database().transaction((tx) => clearDatabase(tx));
    await migrateDatabase();
    fake.upload.mockReset();
    onServer.clear();
    rmSync(new Directory(Paths.document, 'local').uri, { recursive: true, force: true });
  });

  it("shares each synced set's trace once, only while sharing is on; one the server can't read moves aside", async () => {
    for (const setId of ['s1', 's2', 's5']) onServer.add(setId);
    record('pending', 's1', 's2', 's3');
    record('private', 's4');
    fake.upload.mockImplementation(async (url) =>
      url.endsWith('/s2') ? { status: 422, body: 'not a trace' } : { status: 204, body: '' },
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await shareTraces(synced);
    expect(uploaded()).toEqual([]);

    share(true);
    await shareTraces(synced);
    expect(uploaded()).toEqual(['s1', 's2']);
    expect(files('sent')).toEqual(['s1.sht']);
    expect(files('unread')).toEqual(['s2.sht']);
    // Its workout hasn't reached the server: it waits.
    expect(files('pending')).toEqual(['s3.sht']);
    expect(files('private')).toEqual(['s4.sht']);

    await shareTraces(synced);
    expect(uploaded()).toHaveLength(2);
    onServer.add('s3');
    await shareTraces(synced);
    expect(uploaded()).toEqual(['s1', 's2', 's3']);
    expect(files('sent')).toEqual(['s1.sht', 's3.sht']);

    // Turned off: nothing more goes.
    record('pending', 's5');
    share(false);
    await shareTraces(synced);
    expect(uploaded()).toHaveLength(3);
  });

  it('sends nothing once sharing is turned off, even while it reads the session', async () => {
    share(true);
    onServer.add('s1').add('s2');
    record('pending', 's1');
    fake.cookie.mockImplementationOnce(async () => {
      share(false);
      return 'session=1';
    });
    await shareTraces(synced);
    expect(uploaded()).toEqual([]);
  });

  it('stops sharing here too when the server says it was turned off on another phone', async () => {
    share(true);
    onServer.add('s1').add('s2');
    record('pending', 's1', 's2');
    fake.upload.mockResolvedValue({ status: 403, body: 'sharing is off' });
    await shareTraces(synced);
    expect(uploaded()).toHaveLength(1);
    expect(sharingNow()).toBe(false);
    expect(db().select().from(schema.outbox).all()).toEqual([]);
    expect(files('pending')).toEqual(['s1.sht', 's2.sht']);
  });

  it('an upload cut off goes again next time', async () => {
    share(true);
    onServer.add('s1').add('s2');
    record('pending', 's1');
    fake.upload.mockRejectedValueOnce(new Error('Connection reset'));
    await expect(shareTraces(synced)).rejects.toThrow('Connection reset');
    expect(files('pending')).toEqual(['s1.sht']);

    fake.upload.mockResolvedValue({ status: 204, body: '' });
    await shareTraces(synced);
    expect(files('pending')).toEqual([]);
    expect(files('sent')).toEqual(['s1.sht']);
  });

  it('a session the server ended stops it, and the next launch asks to sign in', async () => {
    share(true);
    onServer.add('s1');
    record('pending', 's1');
    fake.upload.mockResolvedValue({ status: 401, body: '' });
    await expect(shareTraces(synced)).rejects.toThrow(SessionGone);
    expect(account()).toMatchObject({ id: 'local', signedOut: true });
    expect(files('pending')).toEqual(['s1.sht']);
  });
});
