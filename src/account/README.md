# Account

Signing in with Google, once, before anything else; the session with our server (`server/`).

| File                            | Holds                                                                                   |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| `server.ts`                     | the server's address, our Google Web client ID, `SessionGone` (a 401)                   |
| `auth-client.ts`                | Better Auth's client: the session cookie in secure storage, sent with each call         |
| `sign-in.ts`                    | `signIn`: the button's machine. Google's sheet, the server's session, the account kept  |
| `session.ts`                    | `checkSession` at launch (renews; name and photo); `signOut`, from Profile              |
| `consent.ts`                    | `consent`: the question after sign-in, once per account; `setSharing`, `tellWithdrawal` |
| `me.ts`                         | `me`: Profile's sharing switch, Sign out and Delete account                             |
| `sync.ts`                       | `send` the outbox, `sync` (send, then pull), `restored`; what sign-out would lose       |
| `store.ts`                      | `keepAccount` (one account per database), `markSignedOut`, `forgetAccount`, old files   |
| `components/sign-in-screen.tsx` | the first launch (canvas board 21a): why the app, Google's dark button                  |
| `components/consent-screen.tsx` | the consent question (board 22b): what you share, what stays, how to stop               |
| `components/avatar.tsx`         | your Google photo over your initials (Profile)                                          |

Google's sheet (Credential Manager, `react-native-nitro-google-signin`) gives an ID token for our Web
client; the server checks it and starts a year-long session. The account (id, name, photo) is kept in the
phone's database (`storage/account.ts`), so later launches go on offline. Only the server answering that
the session is gone (signed out, expired, the account deleted) brings the sign-in screen back, at the next
launch, never mid-use; offline or a failed call leaves you signed in. Calls give up after 20 s. The
database holds one account's data: another account signing in clears it first, after asking when the phone
holds that account's workouts, runs or challenges (what wasn't sent yet would be lost).

`bootstrap/startup.ts` runs both: `identifying` → `signingIn` (the root shows the screen with the
machine's child) before seeding, and `checkSession` once `ready` (it only ever updates the same account).

Right after sign-in, `consent` asks once whether you share your traces (the points the camera tracks,
never video) to train the counter. It isn't asked when this phone has the answer (`storage/consent.ts`)
or the server has a yes for this policy version from any phone. Yes needs the server, which keeps the
proof; Not now is kept on the phone only. Profile's switch changes it later, and trace files record the
answer at capture.

Delete account (Profile) needs the server: once it has deleted the account, startup clears the
database and the account's folder (`forgetAccount`) and shows the sign-in screen, which ends the old
session first. The same deletion runs from a browser at the server's `/delete` page.

Your account on the server (`sync.ts`) holds your challenges, runs, workouts and freezes. The phone sends
its outbox oldest first, 50 rows a call; a taken row leaves it, a refused one is parked with the reason and
the rest go on. Then it pulls the rows written since its cursor, page by page; each page and the cursor are
kept in one transaction, and a row with a change of this phone's still waiting is skipped, so a change made
here wins until it's sent. Rows come in the order the server last wrote them (an edited challenge after its
runs), so foreign keys are off while a page is kept and hold once the pull is whole. The pull writes each
feature's tables itself: the rows are the server's copies of what the features wrote, with no rule left to
apply. `restored` says a pull
reached the end since the database was last cleared. A withdrawal of sharing made offline is sent by
`consent.ts` itself (`tellWithdrawal`), in turn with `setSharing`. `bootstrap/keep-synced.ts` decides
when.

Sign out (Profile) sends what's waiting first. Offline with something unsent it waits and says how many
workouts haven't reached your account; a change the server refused (our bug, never the network) is named,
and only then does Sign out anyway appear. Then the database is cleared, files stay in the account's folder,
and the sign-in screen ends the session with the server and Google (`endSession`, busy button), so a late
answer can't clear a new sign-in's cookie. Signing in again pulls everything back before Home.
