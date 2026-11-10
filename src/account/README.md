# Account

Signing in with Google, once, before anything else; the session with our server (`server/`).

| File                            | Holds                                                                                  |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| `server.ts`                     | the server's address and our Google Web client ID                                      |
| `auth-client.ts`                | Better Auth's client: the session cookie in secure storage, sent with each call        |
| `sign-in.ts`                    | `signIn`: the button's machine. Google's sheet, the server's session, the account kept |
| `session.ts`                    | `checkSession`: at launch, renews the session and brings name and photo up to date     |
| `store.ts`                      | `keepAccount` (one account per database), `markSignedOut`, the pre-account files       |
| `components/sign-in-screen.tsx` | the first launch (canvas board 21a): why the app, Google's dark button                 |

Google's sheet (Credential Manager, `react-native-nitro-google-signin`) gives an ID token for our Web
client; the server checks it and starts a year-long session. The account (id, name, photo) is kept in the
phone's database (`storage/account.ts`), so later launches go on offline. Only the server answering that
the session is gone (signed out, expired, the account deleted) brings the sign-in screen back, at the next
launch, never mid-use; offline or a failed call leaves you signed in. Calls give up after 20 s. The
database holds one account's data: another account signing in clears it first.

`bootstrap/startup.ts` runs both: `identifying` → `signingIn` (the root shows the screen with the
machine's child) before seeding, and `checkSession` once `ready` (it only ever updates the same account).
