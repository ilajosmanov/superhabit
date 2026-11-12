const { withAppBuildGradle } = require('expo/config-plugins');

// shortcut: Sentry 8.28 prepends its Gradle plugin before com.android.application, triggering a
// misleading warning. Remove when Sentry fixes the order. Register BEFORE Sentry in app.json:
// Expo runs these mod callbacks in reverse registration order, so this sees Sentry's output.
module.exports = function withSentryGradleOrder(config) {
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') return mod;

    const contents = mod.modResults.contents;
    const sentry = /^apply plugin: ["']io\.sentry\.android\.gradle["']\r?\n/m;
    const android = /^apply plugin: ["']com\.android\.application["']\r?$/m;
    const sentryIndex = contents.search(sentry);
    const androidIndex = contents.search(android);
    if (sentryIndex !== -1 && androidIndex !== -1 && sentryIndex < androidIndex) {
      mod.modResults.contents = contents
        .replace(sentry, '')
        .replace(android, '$&\napply plugin: "io.sentry.android.gradle"');
    }
    return mod;
  });
};
