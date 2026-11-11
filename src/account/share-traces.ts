import { File, type Directory } from 'expo-file-system';

import { authClient } from './auth-client';
import { sessionEnded } from './call';
import { heardOff, sharingNow } from './consent';
import { SERVER_URL } from './server';
import { sessionNow } from './store';
import { account } from '@/storage/account';
import { sentFolder, traceFolder, unreadFolder } from '@/storage/set-files';

async function move(file: File, to: Directory) {
  to.create({ intermediates: true, idempotent: true });
  // A copy left there by a move cut short is the same file.
  await file.move(to, { overwrite: true });
}

/**
 * Shares the traces in `pending/` (recorded while sharing was on) whose workout has synced, one at a time,
 * while sharing is still on; each moves to `sent/`. One the server can't read moves to `unread/` instead of
 * blocking the rest; one whose workout the server hasn't taken yet (`synced`, the workout feature's rule)
 * waits for a later round. Throws when the server can't be reached, and `SessionGone` (the account marked
 * signed out, as `call` does) when it ended the session; what's left goes next time.
 */
export async function shareTraces(synced: (setId: string) => boolean) {
  const owner = account()?.id;
  const session = sessionNow();
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
    } else if (status === 401) throw sessionEnded(session);
    // The server has sharing off: withdrawn on another phone. This one stops sharing too.
    else if (status === 403) return heardOff();
    else if (status !== 409) throw new Error(`traces: ${status} ${body}`);
  }
}
