import type { Transaction } from './database';
import { outbox } from './schema';

/**
 * Queues a change for the server inside the caller's transaction, so the change and its outbox row are
 * kept or lost together. `data` goes out in a versioned envelope, `{ v: 1, ...data }`.
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
      payload: { ...change.data, v: 1 },
      createdAt: Date.now(),
    })
    .run();
}
