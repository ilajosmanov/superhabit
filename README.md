# Superhabit

A sports challenge and habit-tracking app for iOS and Android, built with Expo and React Native.

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
vp test run            # run logic tests
vp test watch          # watch logic tests
```

Edit screens in `src/app/`. Rebuild with `vp run android` after changing native dependencies or configuration. Add SDK packages with `vp exec expo install <package>`; add other packages with `vp add <package>`.

Styles use NativeWind v5 RC and Tailwind v4, configured in `metro.config.js`, `postcss.config.mjs`, and `src/global.css`. Use `className` and `dark:` variants for system light/dark mode. Keep the pinned NativeWind and `react-native-css` RC versions paired when upgrading.

Place logic tests beside their source as `src/**/*.test.ts`, importing test APIs from `vite-plus/test`. These Node tests cover plain TypeScript logic; native UI and camera behavior need component and device tests separately.

CI runs checks and tests on pushes and pull requests. When upgrading Vite+, align the Vite alias and Vitest pin in `pnpm-workspace.yaml` with `vp toolchain`.

Local iOS builds require macOS and Xcode. See the [Expo setup guide](https://docs.expo.dev/get-started/set-up-your-environment/).
