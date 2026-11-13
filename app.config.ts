import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Two apps from one codebase, installed side by side. `APP_VARIANT=production` builds the store app
 * (app.reprepgo, amber icon, reports to Sentry): eas.json's production profile sets it. Anything else builds "RepRepGo Dev"
 * (app.reprepgo.dev, cyan icon, debug-signed, no Sentry), so local work never replaces the store app.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const production = process.env.APP_VARIANT === 'production';
  // app.json holds the store app; slug and name are restated only because ExpoConfig requires them.
  const base = { ...config, slug: 'reprepgo', name: 'RepRepGo' };
  if (production) {
    return { ...base, extra: { ...base.extra, production } };
  }
  return {
    ...base,
    name: 'RepRepGo Dev',
    icon: './assets/images/dev/icon.png',
    ios: { ...base.ios, bundleIdentifier: 'app.reprepgo.dev' },
    android: {
      ...base.android,
      package: 'app.reprepgo.dev',
      adaptiveIcon: {
        ...base.android?.adaptiveIcon,
        foregroundImage: './assets/images/dev/android-icon-foreground.png',
      },
    },
    extra: { ...base.extra, production },
  };
};
