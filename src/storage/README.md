# storage

What is kept on the phone and how. No UI and no feature rules: a feature says what it keeps.

| File           | Holds                                                                            |
| -------------- | -------------------------------------------------------------------------------- |
| `schema.ts`    | the SQLite tables (Drizzle)                                                      |
| `relations.ts` | how the tables join, for `db.query.<table>.findMany({ with })`                   |
| `database.ts`  | the one database (`superhabit.db`, foreign keys on): `migrateDatabase()`, `db()` |
| `outbox.ts`    | `enqueue`: a change for the server, written in the caller's transaction          |
| `account.ts`   | whose data it is: `userId()` (`'local'` until sign-in)                           |

After changing `schema.ts`, run `vp exec drizzle-kit generate` and commit `migrations/`. Until the first
release there is one `init` migration: delete it and generate again rather than adding one.

The startup machine (`bootstrap/startup.ts`) opens the database and applies the migrations, so a
failure shows Retry instead of crashing; `db()` throws if anything reads before that.

Writes are synchronous `db.transaction(...)` calls with no `await` inside. Screens read with
`useLiveQuery` (from `drizzle-orm/expo-sqlite`), which re-runs when the query's main table changes.

Tests that need real SQL mock `@/storage/database` with `__fixtures__/database.ts`: Node's own SQLite in
memory, migrated from the same files.
