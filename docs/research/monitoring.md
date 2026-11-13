# Monitoring, crash reporting and observability for launch

Research note, 2026-11-12. Nothing here is implemented yet. Prices and limits were checked on the vendors'
own pages on this date (links at each claim); re-check them before paying for anything.

## Summary: what to set up for launch

**Use two services, both free tiers, and nothing else at launch:**

1. **Sentry (Developer plan, free)** for the app and the Worker: `@sentry/react-native` with its Expo
   config plugin and the Sentry Android Gradle Plugin, plus `@sentry/hono` + `@sentry/cloudflare` on the
   Worker. One vendor covers JS errors with Hermes source maps, Java/Kotlin crashes with R8 mapping, NDK
   crashes in the pose module with native symbols, ANRs, and Worker exceptions, all tagged by release.
2. **Cloudflare's own Workers Logs** (already on: `"observability": { "enabled": true }` in
   `server/wrangler.jsonc`) for request logs and Cron runs, with a **Cloudflare custom alert** on Worker
   errors, plus **one free external pinger** (Better Stack or UptimeRobot) on `GET /health`.

**Skip at launch:** product analytics (PostHog etc.), performance tracing on the phone, session replay,
Logpush, Tail Workers, a paid APM. Add PostHog later only if a question needs it, and only opt-in.

**Free-tier limits that matter**

| Limit                      | Value                                                                                                                                                                                                                                | Why it matters here                                                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sentry Developer: errors   | 5k / month, 1 user, 30-day lookback, email alerts only ([pricing](https://sentry.io/pricing/))                                                                                                                                       | App + Worker share it. A crash loop on launch day can burn it; set per-project rate limits / spike protection. Team is $29/mo (50k errors).                                |
| Workers Logs, Workers Free | 200k events / day, 3-day retention ([docs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/))                                                                                                              | From **1 Dec 2026**: 0.5 GB ingest / day, 7-day retention, ingestion stops until 00:00 UTC when hit ([pricing](https://developers.cloudflare.com/observability/pricing/)). |
| D1, Workers Free           | 100k rows written / day, 5M rows read / day, 500 MB per database, **50 queries per invocation** ([pricing](https://developers.cloudflare.com/d1/platform/pricing/), [limits](https://developers.cloudflare.com/d1/platform/limits/)) | When a daily limit is hit, D1 **returns errors** until 00:00 UTC: sync, sign-in and the league Cron would all fail.                                                        |
| R2 free                    | 10 GB-month, 1M Class A (writes), 10M Class B (reads) / month, egress free ([pricing](https://developers.cloudflare.com/r2/pricing/))                                                                                                | Traces of a few hundred KB each: ~10 GB is in the order of tens of thousands of shared sets. Bills, does not stop.                                                         |

**The one non-free recommendation:** put the Cloudflare account on **Workers Paid** before launch
(about $5/month, [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)). On the
free plan the failure mode of success is an outage (D1 stops answering for the rest of the UTC day, the
1,000-vs-50 queries-per-invocation limit, logs that stop), not a bill. Check which plan the account is on
today; this note could not see it.

**Privacy in one line:** with `sendDefaultPii: false` (the default), console breadcrumbs off, no
screenshots and no `setUser` beyond the opaque account id, Sentry receives stack traces, device model/OS,
app version and a random install id. Declare "Crash logs", "Diagnostics" and "Device or other IDs" in Play's
Data safety form, mention Sentry as a processor in the privacy policy, and keep pose data and auth tokens
out of every event (see [Privacy](#5-privacy)).

## What the repo actually has (verified)

- `package.json`: Expo `~58.0.23`, React Native `0.88.1`, React `19.3.0`, expo-router `~58.0.30`,
  Reanimated `4.7.1`, react-native-worklets `0.13.0`, Skia `2.14.0`, VisionCamera `5.2.4`, Nitro modules
  `0.37.2`, better-auth `1.7.20`. Exact versions are pinned (AGENTS.md), so Sentry should be too.
- `modules/pose/android/CMakeLists.txt`: a C++ shared library (`reprepgopose`) linked to VisionCamera;
  MediaPipe underneath. `modules/gzip-file` is also native C++. Native crashes here are real SIGSEGV/SIGABRT
  in `.so` files: they need an NDK handler and uploaded symbols to be readable.
- R8 is on: the generated `android/gradle.properties` has `android.enableMinifyInReleaseBuilds=true`
  (Expo SDK 58's default for release builds), and both modules ship `consumerProguardFiles`. Release Java
  stack traces are obfuscated without the mapping file.
- **EAS is not used**: no `eas.json`; release builds are local (`vp run android:release` →
  `expo run:android --variant release`). CI (`.github/workflows/ci.yml`) only checks, tests and makes a dev
  export; it builds no release. So symbol upload has to happen **on the machine that builds the release**,
  from the Gradle build itself.
- `src/app/_layout.tsx` already exports an expo-router `ErrorBoundary` with
  `// shortcut: the error is neither shown nor reported; add crash reporting once the owner picks a service.`
  and a "Send feedback" button that does nothing yet.
- Server: `server/src/index.ts` is a Hono app with `GET /health` (runs `select 1` on D1) and a `scheduled`
  handler (hourly leagues; at 00:00 UTC trace sweep and account purge). `server/wrangler.jsonc` has
  `compatibility_date: 2026-11-01`, `nodejs_compat`, `observability.enabled: true`, D1 and R2 in `enam`.
- `.gitignore` already ignores `.env*.local` and `*.env`, so a `SENTRY_AUTH_TOKEN` in `.env.local` stays out
  of git.

## 1. Crash and error reporting for the app

### Comparison

|                                    | Sentry                                                                                                                                                                                            | Firebase Crashlytics                                                                                                              | Bugsnag                                                                    | Embrace                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Package                            | `@sentry/react-native` 8.34.0 (5 Nov 2026) ([releases](https://github.com/getsentry/sentry-react-native/releases))                                                                                | `@react-native-firebase/app` + `/crashlytics` v26 ([migration](https://rnfirebase.io/migrating-to-v26))                           | `@bugsnag/react-native`                                                    | `@embrace-io/react-native`                                   |
| Expo config plugin                 | Yes, `@sentry/react-native/expo`; SDK 50+ ([docs](https://docs.sentry.io/platforms/react-native/manual-setup/expo/))                                                                              | Yes, needs `google-services.json` and a Firebase project                                                                          | Yes                                                                        | Yes                                                          |
| Expo 58 / RN 0.88 / New Arch       | 8.33.0 added Expo Router 58 support; recent releases target New Arch (e.g. `longTaskIntegration` needs RN 0.82+ New Arch). RN 0.88 is not named in release notes: confirm with one release build. | v26 **requires** New Arch (TurboModules) ([migration](https://rnfirebase.io/migrating-to-v26)); fits. No SDK 58 matrix published. | Not checked in depth                                                       | Not checked in depth                                         |
| JS errors with Hermes source maps  | Yes, uploaded during the native release build; Debug IDs via `getSentryExpoConfig` in Metro                                                                                                       | JS errors arrive as non-fatals; no JS source-map symbolication for Hermes bundles                                                 | Yes                                                                        | Yes                                                          |
| Java/Kotlin crashes, R8 mapping    | Yes, Android Gradle Plugin `autoUploadProguardMapping` (default on) ([docs](https://docs.sentry.io/platforms/react-native/guides/expo/manual-setup/expo/gradle/))                                 | Yes (Crashlytics Gradle plugin)                                                                                                   | Yes                                                                        | Yes                                                          |
| NDK / C++ crashes                  | Yes, `uploadNativeSymbols` (default on)                                                                                                                                                           | Yes, with `crashlytics-ndk` + symbol upload task                                                                                  | Yes                                                                        | Yes                                                          |
| ANRs                               | Yes; Android 11+ via `ApplicationExitInfo` ([docs](https://docs.sentry.io/platforms/android/configuration/app-not-respond/))                                                                      | Yes                                                                                                                               | Yes                                                                        | Yes                                                          |
| Worker (backend) SDK, same project | **Yes** (`@sentry/cloudflare`, `@sentry/hono`)                                                                                                                                                    | No                                                                                                                                | Node/JS only, no Workers SDK                                               | No (mobile focus, OTel)                                      |
| Free tier                          | 5k errors/mo, 1 user                                                                                                                                                                              | No cost                                                                                                                           | 7.5k events + 1M spans/mo, 1 user ([pricing](https://bugsnag.com/pricing)) | Up to 1M sessions/yr ([pricing](https://embrace.io/pricing)) |
| Extra footprint                    | One SDK, own native lib                                                                                                                                                                           | Google Play services + Firebase Installations; a second Google dependency on top of sign-in                                       | One SDK                                                                    | OTel-based SDK, heavier                                      |

### Verdict

**Sentry.** It is the only option that handles all four crash kinds this app produces (Hermes JS, R8'd
Kotlin, NDK C++ from MediaPipe, ANRs) with uploads wired into a **local** Gradle release build, and the same
account covers the Worker. Crashlytics is free with no cap and good at native crashes, but its weak point is
exactly JS errors under Hermes, which is where most of this app's code is, and it pulls in a Firebase
project. Bugsnag is a fair second choice with a slightly larger free quota but no Workers SDK. Embrace is
aimed at mobile performance/sessions (OpenTelemetry) and is more than a solo launch needs. Newer entrants
(PostHog error tracking, Cloudflare's "Issues" dataset in its observability pricing) are not yet a match for
native crash symbolication; revisit later.

### Sentry details for this repo

- **Release tagging.** The Gradle/plugin step sets release to `<package>@<version>+<versionCode>` and uploads
  bundle + source maps for that release. Bump `version` / `versionCode` for every store build, or crashes
  from two builds land in one release.
- **Source maps.** Metro must use `getSentryExpoConfig(__dirname)` from `@sentry/react-native/metro`
  (it adds Debug IDs). `metro.config.js` already wraps the config for NativeWind; Sentry's goes inside it.
  Uploads are skipped for debug builds ([docs](https://docs.sentry.io/platforms/react-native/sourcemaps/uploading/expo/)).
- **R8 + NDK.** Turn on the Sentry Android Gradle Plugin through the Expo plugin's
  `experimental_android.enableAndroidGradlePlugin` ([docs](https://docs.sentry.io/platforms/react-native/guides/expo/manual-setup/expo/gradle/)).
  Its defaults (`autoUploadProguardMapping`, `uploadNativeSymbols`, `includeNativeSources`) are what we
  want; set `includeNativeSources` false if pose C++ sources should not go to Sentry.
- **Worklets.** Errors thrown inside VisionCamera frame processors / Reanimated worklets run on other JS
  runtimes; they are not guaranteed to reach the main-runtime handler. Catch in the worklet and push the
  error to JS with `scheduleOnRN` (the existing pattern), then `Sentry.captureException` there.
- **Feedback.** The dead "Send feedback" button in the crash screen can use Sentry's user feedback API
  (`Sentry.captureFeedback`) with the last event id, which removes that `shortcut:` too.

## 2. Backend: errors and tracing on Workers

| Tool                                               | Native/free?                                                                                            | What it gives                                                                                                                                                                                                                                                                                | Use at launch?                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| **Workers Logs**                                   | Native; already enabled                                                                                 | `console.*` output + one invocation log per request and per Cron run; query in the dashboard; structured JSON fields are indexed ([docs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/))                                                                        | **Yes** (done)                                           |
| **Custom alerts** (formerly Notifications)         | Native, beta; webhooks on all plans                                                                     | Alert on SQL-queryable telemetry, e.g. "Worker errors increase after a deployment" ([blog](https://blog.cloudflare.com/one-observability-platform/))                                                                                                                                         | **Yes**: errors > N in 5 min; any failed `scheduled` run |
| **Workers traces**                                 | Native, early beta; `observability.traces.enabled`                                                      | Spans for fetch, handlers, KV/R2/DO bindings; D1 not listed; OTel export ([docs](https://developers.cloudflare.com/workers/observability/traces/))                                                                                                                                           | Optional; cheap to turn on with sampling                 |
| **Tail Workers**                                   | Native, extra Worker                                                                                    | Your code receives every invocation's logs/exceptions                                                                                                                                                                                                                                        | No: rebuilds what Sentry does                            |
| **Logpush**                                        | Now on self-serve plans, usage-priced ([blog](https://blog.cloudflare.com/one-observability-platform/)) | Ship logs to R2 / a vendor                                                                                                                                                                                                                                                                   | No: no need for long retention yet                       |
| **Sentry** (`@sentry/hono` + `@sentry/cloudflare`) | Vendor, free tier shared with app                                                                       | Grouped exceptions with stack traces, release from `CF_VERSION_METADATA`, source maps, alert on new issue ([Hono guide](https://docs.sentry.io/platforms/javascript/guides/cloudflare/frameworks/hono/), [Cloudflare guide](https://docs.sentry.io/platforms/javascript/guides/cloudflare/)) | **Yes**                                                  |
| Baselime                                           | Folded into Cloudflare's observability after the 2024 acquisition                                       | (now the native dashboard)                                                                                                                                                                                                                                                                   | n/a                                                      |

**Pricing change on 1 Dec 2026:** Workers Logs, Workers Traces and the other Cloudflare log datasets move
to one volume pricing: Free 0.5 GB/day with 7-day retention and a hard stop; Paid 50 GB ingest + 10 GB-month
storage included, then $0.25/GB ingested and $0.10/GB-month stored
([pricing](https://developers.cloudflare.com/observability/pricing/)). At launch volumes this is free either
way; keep logs short and structured (`console.log({ route, status, ms })`) and never log request bodies.

**Why both Logs and Sentry:** Workers Logs answers "what happened on this request / this Cron hour";
Sentry answers "what new error appeared, how often, since which deploy", and emails you. Sentry needs
`nodejs_compat` (already set) for `AsyncLocalStorage`.

## 3. Uptime and alerting

- **Health endpoint**: `GET /health` already exists and touches D1. Point an external pinger at
  `https://reprepgo.app/health`. At one
  check a minute that is ~1,440 D1 row reads a day: negligible.
- **External pinger options** (free tiers; both vendors' free plans have had "personal use" wording, so
  read the current terms before relying on one for a commercial app):
  - Better Stack: 10 monitors, 3-minute checks, status page, email/Slack
    ([comparison](https://betterstack.com/community/comparisons/better-stack-vs-uptimerobot/)).
  - UptimeRobot: 50 monitors, 5-minute checks
    ([2026 overview](https://notifier.so/guides/uptimerobot-pricing-2026/)).
  - Sentry Uptime Monitoring: 1-minute to 1-hour checks, alerts through Sentry
    ([docs](https://docs.sentry.io/product/uptime-monitoring/)); the free-plan monitor allowance is not on
    the docs page, check it in the dashboard. Using it keeps everything in one place.
- **The Cron**: an external pinger cannot see a failed `scheduled` run. Use either a Cloudflare custom
  alert on failed Cron invocations, or Sentry Cron Monitoring (check-ins around the `scheduled` handler).
  The Monday 00:00 UTC league close is the run worth watching.
- **Limits worth an alert** (Cloudflare dashboard / custom alerts, or a weekly look until there is traffic):
  - D1 rows written per day vs 100k (Free). Writes include index updates; sync from a returning phone and the
    hourly league writes are the big users.
  - D1 database size vs 500 MB (Free) / 10 GB (Paid).
  - D1 queries per invocation: 50 on Free. `closeWeek` / `placeTrainers` over many users in one Cron
    invocation is the place that can hit it; batch with `db.batch()` (counts as one query).
  - R2 storage vs 10 GB-month and Class A ops vs 1M / month (trace uploads are Class A).
  - 429s from `AUTH_LIMIT` / `ACCOUNT_LIMIT`: a jump means a client retry bug or abuse.

## 4. Product analytics and performance (secondary)

- **At launch: nothing.** The questions a free launch needs answered (are people crashing, does sync
  work, is the API up) are covered above. Server-side counts (sign-ups, syncs, shared traces) can come
  from D1 queries.
- **Later, if needed: PostHog** (third-party reports put the free tier at 1M events and 2,500 mobile
  recordings a month; check [posthog.com/pricing](https://posthog.com/pricing)). Make it opt-in, separate
  from the crash-reporting choice, never session replay on the workout screen (camera).
- **Sentry performance**: leave `tracesSampleRate` at 0 on the phone at first. Per-frame work lives in
  worklets and native code that JS tracing does not see; the pose module's fps logs already measure what
  matters. On the Worker, a low rate (0.1) is cheap: the free plan includes 5M spans.

## 5. Privacy

**What each tool sends by default**

| Tool                    | By default                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Off / scrub                                                                                                                                                                                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sentry RN               | Stack trace, device model, OS, app version, random per-install id (not `ANDROID_ID`, no ad id) ([mobile privacy](https://docs.sentry.io/security-legal-pii/security/mobile-privacy/)); **console logs as breadcrumbs**; **full HTTP URLs** of requests; IP inferred server-side ([data collected](https://docs.sentry.io/platforms/react-native/data-management/data-collected/)). User id, device name: only with `sendDefaultPii: true`. Screenshots, view hierarchy: off. | Keep `sendDefaultPii: false`; `breadcrumbsIntegration({ console: false })`; `beforeSend` / `beforeBreadcrumb` to drop query strings and anything under `/traces/`; in Sentry project settings turn on "Prevent storing of IP addresses" and the server-side data scrubber. |
| Sentry Cloudflare       | User info (IP, id), HTTP bodies and query strings unless disabled; keys on a denylist are always `[Filtered]` ([docs](https://docs.sentry.io/platforms/javascript/guides/cloudflare/))                                                                                                                                                                                                                                                                                       | `dataCollection: { userInfo: false, ... }`, no bodies (sync payloads and trace uploads must never be attached); strip `Authorization` / cookie headers.                                                                                                                    |
| Crashlytics (if chosen) | Stack traces, app state, device metadata, Crashlytics installation UUID ([disclosure](https://firebase.google.com/docs/android/play-data-disclosure))                                                                                                                                                                                                                                                                                                                        | `crashlytics_auto_collection_enabled: false` to gate on consent.                                                                                                                                                                                                           |
| Workers Logs            | Whatever `console.*` prints + request method/URL per invocation                                                                                                                                                                                                                                                                                                                                                                                                              | Don't log bodies, tokens or emails; 3–7 day retention.                                                                                                                                                                                                                     |

**Rules for this app**

- Pose traces, rep data and anything from the camera never go into an event, breadcrumb, tag or log line.
  Traces are covered by their own consent (`SHARING_FACTS`); crash reporting must not become a side channel.
- If you call `Sentry.setUser`, pass only the opaque account id, never email or Google name.
- Health data angle: rep counts and form scores are fitness data, not special-category health data in most
  readings, but keep them out of telemetry anyway so the question never arises.

**Consent (UK GDPR / GDPR, not legal advice)**

- Crash reporting with the scrubbing above is usually run on **legitimate interests** (keeping the app
  working), disclosed in the privacy policy, with an off switch in Profile. Storing an install id on the
  device also touches PECR/ePrivacy; the UK's Data (Use and Access) Act 2025 widened the exemptions for
  this kind of storage, but confirm the wording with whoever owns the privacy policy.
- Product analytics, if ever added: **opt-in**, its own question, not bundled with trace sharing.
- Sentry is a processor: sign its DPA (in the org settings). Data region: Sentry offers US and EU
  regions; US/UK users first makes the US region acceptable with the UK extension to the EU-US Data
  Privacy Framework, but EU region is the safer default if EU users are expected. The region cannot be
  changed later without a new org.
- Account deletion: Sentry events keyed by account id should be deletable or age out (30 days on the free
  plan). Mention the retention in the privacy policy.

**Play Data safety entries for Sentry** (Play's own definitions: [data types](https://support.google.com/googleplay/android-developer/answer/10787469))

- App info and performance → **Crash logs**, **Diagnostics**: collected, not shared (a processor is not
  "sharing"), purpose App functionality / Analytics, not optional unless you build the switch.
- Device or other IDs → collected (the Sentry install id; Play lists installation ids here).
- Personal info → User IDs: only if `setUser({ id })` is used.
- Encrypted in transit: yes. Deletion request: covered by the existing deletion flow plus retention.

## 6. Setup plan for this repo

Not implemented. Paths follow `CODING_STANDARDS.md` (app start in `src/bootstrap/`, routes only compose).

**Accounts**

1. Create a Sentry org (pick the data region once), two projects: `reprepgo-android` (React Native) and
   `reprepgo-worker` (Cloudflare). Sign the DPA, enable IP scrubbing, set spike protection.
2. Create an org auth token with release/project write scope; put it in `.env.local` as
   `SENTRY_AUTH_TOKEN` on the build machine (already git-ignored). Never in `app.json`.
3. Move the Cloudflare account to Workers Paid (or accept the free-plan stop-the-day failure mode).

**App**

4. `vp add @sentry/react-native@8.34.0` (exact pin; use `vp exec expo install --check` to see if Expo
   recommends a different one).
5. `app.json` → `plugins`:
   ```json
   [
     "@sentry/react-native/expo",
     {
       "organization": "<org>",
       "project": "reprepgo-android",
       "url": "https://sentry.io/",
       "experimental_android": { "enableAndroidGradlePlugin": true }
     }
   ]
   ```
   Then `expo prebuild --clean` (native config change, see memory: verify with an export build and a
   release build).
6. `metro.config.js`: build the base config with `getSentryExpoConfig(__dirname)` instead of
   `getDefaultConfig`, then wrap it with NativeWind as today.
7. `src/bootstrap/crash-reporting.ts`: `Sentry.init({ dsn, sendDefaultPii: false, tracesSampleRate: 0,
   integrations: [breadcrumbsIntegration({ console: false })], beforeSend, beforeBreadcrumb, enabled: !__DEV__ })`
   plus the scrubbing helpers. Import it first in `src/app/_layout.tsx`, wrap the root with `Sentry.wrap`,
   and in the existing `ErrorBoundary` call `Sentry.captureException(error)`; remove the `shortcut:` line.
   The DSN is not a secret; keep it in that file or `app.json` `extra`.
8. Worklet errors: in `src/workout/pose/` catch inside the frame processor and report via `scheduleOnRN`.
9. Profile switch "Send crash reports" (default on) stored with the other account choices; when off,
   `Sentry.close()` / `enabled: false` on next start. Add one line to the privacy policy.
10. Verify on a **release** build: a JS `throw`, a Kotlin `throw` (R8-deobfuscated?), and a deliberate
    `abort()` in the pose module (C++ frame symbolicated?), then an ANR via a blocking main-thread sleep.
    Remove the test triggers. Check that release names match `version` / `versionCode`.

**Worker**

11. In `server/`: `vp add @sentry/hono @sentry/cloudflare` (same version, exact pin).
12. `server/wrangler.jsonc`: add `"version_metadata": { "binding": "CF_VERSION_METADATA" }` (release name),
    `"upload_source_maps": true`, and the DSN as a var or `wrangler secret put SENTRY_DSN`. Keep
    `observability.enabled`; optionally add `"traces": { "enabled": true, "head_sampling_rate": 0.1 }`.
13. `server/src/index.ts`: `app.use(sentry(app, (env) => ({ dsn: env.SENTRY_DSN, tracesSampleRate: 0.1,
    dataCollection: { userInfo: false } })))` before the routes; wrap `scheduled` so a rejected Cron run is
    captured (and optionally a Sentry Cron check-in). Add `SENTRY_DSN` to `Bindings` in `server/src/env.ts`.
14. Source maps: after `wrangler deploy`, upload with `sentry-cli sourcemaps upload` for the release
    (`npx @sentry/wizard@latest -i sourcemaps` generates the step). Deploys are manual today, so this is a
    `deploy` script line, not CI.

**Alerts**

15. Sentry: alert on every new issue (email) for both projects; regression alerts on.
16. Cloudflare: custom alert on Worker error rate and on failed scheduled invocations; usage notifications
    for D1 and R2.
17. Better Stack (or UptimeRobot / Sentry Uptime) on `/health`, 1–3 minute checks, email + phone push.

**CI** (`.github/workflows/ci.yml`): nothing to add now. Uploads happen in the local release build and
the manual deploy. When release builds or deploys move to CI (or EAS), add `SENTRY_AUTH_TOKEN` as a
repository secret and let the Gradle step / `sentry-cli` read it from the environment.

## Open questions

- Which Cloudflare plan the account is on (decides the D1 failure mode and log limits).
- Whether the Sentry Developer plan includes an uptime monitor and a Cron monitor (dashboard only).
- Exact Sentry React Native support for RN 0.88: release notes name Expo Router 58 but not RN 0.88;
  step 10 is the test.
- UptimeRobot / Better Stack free-plan commercial-use terms, as of the day you sign up.
