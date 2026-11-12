# Superhabit

A sports challenge and habit-tracking app built with Expo and React Native: the phone's camera counts your reps. Android only for now (the two native modules in `modules/` have no iOS code yet).

- `src/`: the app. `CODING_STANDARDS.md` says how it is laid out (layers, where a file goes, what a useful test is) and `AGENTS.md` holds the tooling and React rules; each folder has a short `README.md`.
- `server/`: the Cloudflare Worker the app signs in to and syncs with. See [`server/README.md`](server/README.md).
- `modules/`: the native pose detector and gzip writer (Nitro modules). `plugins/`: our Expo config plugins.

## Android setup

Requires Node.js 22.18+ (22.x), [Vite+](https://viteplus.dev) (`vp`, which runs pnpm under the hood), JDK 17, and the Android SDK command-line tools. Configure `JAVA_HOME`, `ANDROID_HOME`, and add the SDK tools to `PATH`.

Install the required Android packages:

```bash
android sdk install platform-tools platforms/android-37.0 build-tools/37.0.0 ndk/27.1.12297006
```

Enable USB debugging on your Android phone, connect it, and authorize your computer. From the project directory:

```bash
vp install
adb devices
vp run android
```

With several devices attached, pick one: `vp run android --device <serial>` (serial from `adb devices`).

`vp run android` also keeps the phone's screen on while it charges (Developer options → Stay awake), so it doesn't lock mid-test. Any charger counts: a laptop's fast-charging USB-C port reports as AC, not USB. The setting stays on the phone across reboots; turn it off with:

```bash
adb shell svc power stayon false
```

The phone reaches Metro at `localhost:8081` through the USB cable, so changing networks doesn't break it. `vp run android` sets up that forward, but it's lost when adb restarts or the cable reconnects. If the app can't reach Metro or the JS debugger finds nothing, restore it:

```bash
adb reverse tcp:8081 tcp:8081
```

If the app hangs on the splash screen after you switch networks, it is still looking for Metro at an old Wi-Fi address (logcat shows `failed to connect to /<ip> (port 8081)`). Point it back at `localhost:8081` and restart it. Do this from the dev menu (Settings → Debug server host), or from the laptop:

```bash
adb shell "run-as com.ilajosmanov.superhabit sed -i 's/<old-ip>:8081/localhost:8081/' shared_prefs/com.ilajosmanov.superhabit_preferences.xml"
```

If the USB connection keeps dropping, connect over Wi-Fi instead. Open the dev menu (shake the phone), go to Settings → Debug server host, and enter `<laptop-ip>:8081` (find the IP with `ip -br addr`). Phone and laptop must be on the same network, with port 8081 open in the firewall. Update the host whenever the laptop's IP changes.

To test without the cable, install a release build: it bundles the JavaScript, so it runs without Metro. Rebuild it after each code change. It builds only `arm64-v8a` (every current phone) to cut native compile time.

```bash
vp run android:release
```

## Development

Expo and Metro run the app; Vite+ handles packages, checks, and logic tests:

```bash
vp run start           # development server
vp check               # formatting, lint, and type checks
vp check --fix         # apply formatting and safe lint fixes
vp run typecheck       # Expo's TypeScript compiler check
vp exec expo export --dev --platform android --output-dir /tmp/bundle   # bundle as a dev build: fails on a screen the React Compiler can't compile (vp check doesn't)
vp test run            # run logic tests
vp test watch          # watch logic tests
```

Edit screens in `src/app/`. Rebuild with `vp run android` after changing native dependencies. After changing `app.json` or `plugins/` (a permission, a font, the backup rules), regenerate the native project first, or nothing changes: `vp run android` only generates `android/` when it is missing.

```bash
vp exec expo prebuild --platform android --clean
vp run android
```

`android/` is generated and git-ignored: never edit it by hand. Add SDK packages with `vp exec expo install <package>`; add other packages with `vp add <package>`.

Styles use NativeWind v5 RC and Tailwind v4, configured in `metro.config.js`, `postcss.config.mjs`, and `src/global.css`. The app is dark only (`userInterfaceStyle` in `app.json`): style with `className`, no `dark:` variants. Keep the pinned NativeWind and `react-native-css` RC versions paired when upgrading.

Place logic tests beside their source as `src/**/*.test.ts`, importing test APIs from `vite-plus/test`. These Node tests cover plain TypeScript logic; native UI and camera behavior need component and device tests separately.

CI (`.github/workflows/ci.yml`) runs the typecheck, `vp check`, ktlint, a dev bundle (which runs the React Compiler) and the tests on pushes and pull requests. When upgrading Vite+, align the Vite alias and Vitest pin in `pnpm-workspace.yaml` with `vp toolchain`.

## The server, accounts and keys

The app talks to the Worker at the address in `src/account/server.ts`: production, unless `EXPO_PUBLIC_SERVER_URL` is set when Metro starts or the release is built. Point a dev build at your own Worker rather than at production: `EXPO_PUBLIC_SERVER_URL=<your Worker's address> vp run start` (see `server/README.md` for running one).

One git-ignored `.env` in the repo root holds local credentials; ask the owner for the values, never commit them:

- `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`: deploying the Worker and migrating its database.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: the Web OAuth client.
- `SENTRY_AUTH_TOKEN` (and `SENTRY_SETUP_CODE` while setting up Sentry): build/upload tooling.
- Only for running the backend locally: `BETTER_AUTH_SECRET` (generate with `openssl rand -base64 32`)
  and `BETTER_AUTH_URL=http://localhost:8787`.
- Optional `SENTRY_DSN`: the server project's DSN, to report errors from the local Worker.

Expo loads `.env` automatically; only `EXPO_PUBLIC_` variables are inlined into the app, so never give
credentials that prefix. `vp run android` connects to the deployed backend by default.
For optional local backend development, `vp run dev` from `server/` loads the same file. Deployment and
migration commands are in `server/README.md`. Production Worker secrets stay in Cloudflare: changing
`.env` does not update them.

Sign-in with Google needs two OAuth clients in one Google Cloud project:

- a **Web** client, whose ID is in `src/account/server.ts` and `server/wrangler.jsonc`, with `https://<the Worker>/api/auth/callback/google` as an authorised redirect URI (the `/delete` page signs in through it);
- an **Android** client for the package `com.ilajosmanov.superhabit` and the SHA-1 of the key the build is signed with. Builds are signed with the debug keystore for now, so one client covers everyone; a new signing key needs its SHA-1 added, or Google's sheet fails on that build.

## Recorded traces for the counter tests

The counters are tested against real recorded sets in `src/exercises/__fixtures__/traces/`. That folder is git-ignored (the clips' licences vary), and without it those tests skip and the suite still shows green. Ask the owner for the folder and copy it in before trusting a green run of a counter change.

## Handing out a build

`vp run android:release` makes the APK. Before each build you hand out, raise `version` in `app.json` and set a higher `android.versionCode`, then prebuild: every workout is stamped with the app version, which is how a report is tied to a build. Release builds are signed with the debug keystore for now; moving to a real key later means everyone uninstalls first, which deletes the videos on their phone.
