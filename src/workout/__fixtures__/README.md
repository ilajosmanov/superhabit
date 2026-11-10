# fixtures

Test boundaries shared by the workout session, log, recovery and capture tests.

| File         | Holds                                                                                  |
| ------------ | -------------------------------------------------------------------------------------- |
| `session.ts` | native module fakes, camera output, in-memory files, pose sequences and database reset |

Tests use real machines and counters between these native boundaries and Node SQLite.
