import { and, eq, notExists } from 'drizzle-orm';
import { File, type Directory } from 'expo-file-system';

import { authClient } from './auth-client';
import { heardOff, sharingNow } from './consent';
import { SERVER_URL, SessionGone } from './server';
import { account } from '@/storage/account';
import { db } from '@/storage/database';
import { outbox, sets, workouts } from '@/storage/schema';
import { sentFolder, traceFolder, unreadFolder } from '@/storage/set-files';

/** The set's workout is done and on the server: nothing of it waits in the outbox, sent or parked. */
const synced = (setId: string) =>
  db()
    .select({ id: sets.id })
    .from(sets)
    .innerJoin(workouts, eq(workouts.id, sets.workoutId))
    .where(
      and(
        eq(sets.id, setId),
        eq(workouts.status, 'done'),
        notExists(
          db()
            .select()
            .from(outbox)
            .where(and(eq(outbox.entity, 'workout'), eq(outbox.entityId, workouts.id))),
        ),
      ),
    )
    .get() !== undefined;

async function move(file: File, to: Directory) {
  to.create({ intermediates: true, idempotent: true });
  // A copy left there by a move cut short is the same file.
  await file.move(to, { overwrite: true });
}

/**
 * Shares the traces in `pending/` (recorded while sharing was on) whose workout has synced, one at a time,
 * while sharing is still on; each moves to `sent/`. One the server can't read moves to `unread/` instead of
 * blocking the rest; one whose workout the server hasn't taken yet waits for a later round. Throws when the
 * server can't be reached; what's left goes next time.
 */
export async function shareTraces() {
  const owner = account()?.id;
  if (!owner) return;
  // This account's folders, though another signs in while a file goes up.
  const [pending, sent, unread] = [traceFolder(true), sentFolder(), unreadFolder()];
  if (!pending.exists) return;
  for (const { name } of pending.list()) {
    if (!name.endsWith('.sht')) continue;
    const cookie = await authClient.getCookie();
    // Turned off, or signed out, meanwhile: checked last before the file goes.
    if (!sharingNow() || account()?.id !== owner) return;
    const setId = name.slice(0, -'.sht'.length);
    if (!synced(setId)) continue;
    const file = new File(pending, name);
    const { status, body } = await file.upload(`${SERVER_URL}/traces/${setId}`, {
      httpMethod: 'PUT',
      headers: { cookie },
    });
    if (status === 204) await move(file, sent);
    else if (status === 413 || status === 422) {
      console.warn('[traces] the server could not read', setId, body);
      await move(file, unread);
    } else if (status === 401) throw new SessionGone();
    // The server has sharing off: withdrawn on another phone. This one stops sharing too.
    else if (status === 403) return heardOff();
    else if (status !== 409) throw new Error(`traces: ${status} ${body}`);
  }
}
