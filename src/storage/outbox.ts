import type { Transaction } from './database';
import { outbox } from './schema';

/**
 * Queues a change for the server inside the caller's transaction, so the change and its outbox row are
 * kept or lost together. `data` is what the server keeps (`account/sync.ts` sends it).
 */
export function enqueue(
  tx: Transaction,
  change: { entity: string; entityId: string; op: string; data: object },
) {
  tx.insert(outbox)
    .values({
      entity: change.entity,
      entityId: change.entityId,
      op: change.op,
      payload: change.data,
      createdAt: Date.now(),
    })
    .run();
}
