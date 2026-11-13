# display-corners

Reads the display's rounded-corner radii so a line drawn round the screen's edge follows the glass. An
Expo module (one getter needs none of Nitro's C++), on Android and iOS. It reads on the main thread,
as UIKit and Android views require, so it returns a promise. The countdown's `EdgeClock`
(`src/workout/components/time-left.tsx`) is its one caller and reads it once per countdown.

| File                                | Does                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------- |
| `src/display-corners.ts`            | the package entry: `displayCorners()`: a promise of radii in dp, or null        |
| `android/…/DisplayCornersModule.kt` | `WindowInsets.getRoundedCorner` (Android 12+), px ÷ density                     |
| `ios/DisplayCornersModule.swift`    | a full-window `.containerConcentric()` probe view's `effectiveRadius` (iOS 26+) |

Older systems return null and the caller keeps its fixed radius. iOS reads no private API
(`_displayCornerRadius` risks App Store rejection). Rebuild the app after changing native code.
