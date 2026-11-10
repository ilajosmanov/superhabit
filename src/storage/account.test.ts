import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { account, userId } from './account';
import { db, migrateDatabase } from './__fixtures__/database';
import { settings } from './schema';

vi.mock('@/storage/database', () => import('@/storage/__fixtures__/database'));

describe('the kept account', () => {
  beforeEach(() => migrateDatabase());

  it('is nobody before the first sign-in, and then nothing can be stamped', () => {
    db().delete(settings).run();
    expect(account()).toBeNull();
    expect(userId).toThrow();
  });

  it('refuses an unreadable account rather than taking it for nobody, which would clear the data', () => {
    db()
      .update(settings)
      .set({ value: { id: 7 } })
      .run();
    expect(account).toThrow('unreadable');
  });
});
