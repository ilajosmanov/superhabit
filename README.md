# Superhabit

A sports challenge and habit-tracking app for iOS and Android, built with Expo and React Native.

## Android setup

Requires Node.js 22.18+ (22.x), pnpm, JDK 17, and the Android SDK command-line tools. Configure `JAVA_HOME`, `ANDROID_HOME`, and add the SDK tools to `PATH`.

Install the required Android packages:

```bash
android sdk install platform-tools platforms/android-37.0 build-tools/37.0.0 ndk/27.1.12297006
```

Enable USB debugging on your Android phone, connect it, and authorize your computer. From the project directory:

```bash
pnpm install
adb devices
pnpm android
```

## Development

Expo and Metro run the app; Vite+ handles checks and logic tests:

```bash
pnpm start             # development server
pnpm check             # formatting, lint, and type checks
pnpm check:fix         # apply formatting and safe lint fixes
pnpm typecheck         # Expo's TypeScript compiler check
pnpm test              # run logic tests
pnpm test:watch        # watch logic tests
```

Edit screens in `src/app/`. Rebuild with `pnpm android` after changing native dependencies or configuration. Add SDK packages with `pnpm exec expo install <package>`.

Place logic tests beside their source as `src/**/*.test.ts`, importing test APIs from `vite-plus/test`. No app tests exist yet; empty suites are temporarily allowed. These Node tests cover plain TypeScript logic; native UI and camera behavior need component and device tests separately.

CI runs checks and tests on pushes and pull requests. When upgrading Vite+, align the Vite alias and Vitest pin in `pnpm-workspace.yaml` with `pnpm exec vp toolchain`.

Local iOS builds require macOS and Xcode. See the [Expo setup guide](https://docs.expo.dev/get-started/set-up-your-environment/).
