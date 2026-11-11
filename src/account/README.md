# Account

Signing in with Google, once, before anything else; the session with our server (`server/`).

| File                            | Holds                                                                                                    |
| ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `server.ts`                     | the server's address (`EXPO_PUBLIC_SERVER_URL`), our Google Web client ID, `SessionGone`                 |
| `call.ts`                       | `call`: every call to our server; `sessionEnded` (a 401); `whyCallFailed`, its words                     |
| `auth-client.ts`                | Better Auth's client: the session cookie in secure storage, sent with each call                          |
| `sign-in.ts`                    | `signIn`: the button's machine. Google's sheet, the server's session, the account kept                   |
| `session.ts`                    | `checkSession` at launch (renews; name and photo); `signOut`, from Profile                               |
| `consent.ts`                    | `consent`: the question while this phone has no answer; `setSharing`, `shares` (in force)                |
| `me.ts`                         | `me`: Profile's sharing switch (`sharingShown`), Sign out and Delete account                             |
| `sync.ts`                       | `send` the outbox, `sync` (send, then pull), `restored`; what sign-out would lose                        |
| `one-at-a-time.ts`              | `oneAtATime()`: async jobs run in turn; sync rounds and consent calls each queue on one                  |
| `share-traces.ts`               | `shareTraces`: traces recorded while sharing was on go up once their workout has synced                  |
| `store.ts`                      | its tables: the kept account, marked signed out or forgotten, its session; the sharing answer; old files |
| `components/sign-in-screen.tsx` | the first launch (canvas board 21a): why the app, Google's dark button                                   |
| `components/consent-screen.tsx` | the consent question (board 22b): what you share, what stays, how to stop                                |
| `components/profile-screen.tsx` | Profile (board 23): your name and photo, the sharing switch, Sign out, Delete account                    |

Google's sheet (Credential Manager, `react-native-nitro-google-signin`) gives an ID token for our Web
client; the server checks it and starts a year-long session. The account (id, name, photo) is kept in the
phone's database (`storage/account.ts`), so later launches go on offline. Only the server answering that
the session is gone (signed out, expired, the account deleted) brings the sign-in screen back, at the next
launch, never mid-use; offline or a failed call leaves you signed in. Calls give up after 20 s (the
client's timeout); the read of your consent before the question, after 5 s. A trace upload has no timeout
of ours: Android's own gives up after 60 s without progress. The
database holds one account's data: another account signing in clears it first, after asking when the phone
holds that account's workouts, runs or challenges (what wasn't sent yet would be lost).

`bootstrap/startup.ts` runs both: `identifying` → `signingIn` (the root shows the screen with the
machine's child) before seeding, and `checkSession` once `ready` (it only ever updates the account kept when it asked).
Better Auth's Expo plugin writes the cookie an answer sets before the call returns, and the server answers
an expired session with a cookie that removes it. So when startup leaves `ready` the check's request is
aborted (the actor's `signal`), and a sign-in's call waits its turn behind the check's (`cookieTurn` in
`session.ts`): an answer already being read when the check stopped writes first, and the new sign-in's
cookie is written over it.

Right after sign-in, `consent` asks whether you share your traces (the points the camera tracks,
never video) to train the counter. It isn't asked when this phone has the answer (`storage/consent.ts`)
or the server has a yes for this policy version from any phone, so it comes again after each sign-out
(which clears the phone), on each new phone, and for each new policy version. Yes needs the server, which keeps the
proof; Not now is kept on the phone only. Profile's switch changes it later; turning it on shows the
same facts first, and Cancel turns nothing on. The switch shows the answer from the shared snapshot
(`challenges/library-live.tsx`), so a change behind the screen (`heardOff`) shows too; only while its
call runs, and for 300 ms after it went through (`settling`: the snapshot's live query reads the kept
answer a frame or two after the call returns, and the switch mustn't jump back meanwhile), does it show
the new place the machine holds. The switch is off meanwhile. A trace records the answer in force when its set started,
which decides its folder: `pending/` to be shared, `private/` never.

After each sync round, `shareTraces` sends the traces in `pending/` whose workout the server has (the
workout feature's `setIsSynced`, handed in by `bootstrap/keep-synced.ts`), one at a time, while sharing is still on, and moves each to `sent/`. One the server can't read moves to `unread/`.
Turning sharing off stops them; the server deletes what was shared when it hears the withdrawal.

Delete account (Profile) needs the server: once it has deleted the account, startup clears the
database and the account's folder (`forgetAccount`) and shows the sign-in screen, which ends the old
session first. A retry whose answer is a 401 (the first try's answer was lost, and the session went with
the account) says you've been signed out instead of "Couldn't reach", and offers Sign in again. The same
deletion runs from a browser at the server's `/delete` page. Profile and the consent screen link to the
privacy policy at the server's `/privacy`.

Your account on the server (`sync.ts`) holds your challenges, runs, workouts and freezes. The phone sends
its outbox oldest first, 10 rows a call (the server takes up to 50), and one at a time after the server
answers that a call was over its 1 MB; a taken row leaves it, a refused one is parked with the reason and
the rest go on. Then it pulls the rows written since its cursor, page by page; each page and the cursor are
kept in one transaction, and a row with a change of this phone's still waiting is skipped, so a change made
here wins until it's sent. Rows come in the order the server last wrote them (an edited challenge after its
runs), so foreign keys are off while a page is kept and hold once the pull is whole. The pull writes each
feature's tables itself: the rows are the server's copies of what the features wrote, with no rule left to
apply. A page answered after a sign-out is dropped, even when the same account signed in again (its
cursor is gone). A send and a pull never run at once. `restored` says a pull
reached the end since the database was last cleared. A withdrawal of sharing made offline is sent by
`consent.ts` itself (`tellWithdrawal`), in turn with `setSharing`. `bootstrap/keep-synced.ts` decides
when.

Sign out (Profile) sends what's waiting first. Offline with something unsent it waits and says how many
workouts haven't reached your account; a change the server refused (our bug, never the network) is named,
and only then does Sign out anyway appear. Each time the dialog opens it starts afresh (`me` states
`signingOut` and `deleting`, each `asking` until you tap); while a call runs its buttons are off.
Then the database is cleared, or, when something is still unsent (the server had ended the session), kept
and marked signed out by you (`byYou`) for the same account's next sign-in, whose screen then doesn't say
the session ended. Files stay in the account's folder. The
sign-in screen ends the session with the server and Google (`endSession`), so a late answer can't clear a
new sign-in's cookie; a tap meanwhile shows the button busy and signs in once it's done. Signing in again
tries one pull before Home (`bootstrap/startup.ts`, 30 s at most); if it fails, Home opens anyway and
`keepSynced` pulls later.

Every call to our server goes through `call` (`call.ts`): a 401 throws `SessionGone` and marks the kept
account signed out, if it is still the session that called (`sessionNow`: the same account, and no
sign-in since, so an old answer can't sign out a new sign-in of the same account), so the next launch
shows the sign-in screen, which says the session ended. The trace upload (a file, which `call` can't send)
answers a 401 the same way, with `sessionEnded`. Profile, League and the consent question say you've been
signed out and offer Sign in again, which goes there at once (startup's `sessionEnded`); what isn't sent
yet stays, and the consent question's Not now still works. Any other error status throws
`Refused` with its status (sync reads 413, League 503). `whyCallFailed` turns an error into `offline`,
`failed` or `signedOut`, and `FAILURE_TEXT` says each.

Only `store.ts` writes or queries this feature's tables (the sharing answer, the outbox's withdrawal, the
kept account), with one exception: `sync.ts`'s pull writes every feature's tables itself, and reads the
outbox to send it. Other files read the kept account (`storage/account.ts`) and the sharing answer
(`storage/consent.ts`) through storage's readers.

`SERVER_URL` is production unless `EXPO_PUBLIC_SERVER_URL` is set when Metro starts or the release is built
(Expo inlines it into the bundle then): point a dev build at your own Worker with it.
