import * as Sentry from '@sentry/react-native';

/**
 * Crashes and errors go to Sentry (project superhabit-app): JavaScript errors, Android's native crashes and
 * ANRs, and a tenth of navigations as traces. Imported first by the root layout, so it starts before anything
 * else runs. Nothing about the person goes: no IP, no account, no console output, no screen.
 */
Sentry.init({
  // Not a secret: every APK carries it; it only lets the app send events to this one project.
  dsn: 'https://a9131fa96f29096fc81d308c80b95127@o4512415530876928.ingest.us.sentry.io/4512415546933248',
  environment: __DEV__ ? 'development' : 'production',
  sendDefaultPii: false,
  tracesSampleRate: __DEV__ ? 1 : 0.1,
  integrations: [
    Sentry.expoRouterIntegration(),
    // What the app logs may carry a set's numbers or a server reply; the crash doesn't need it.
    Sentry.breadcrumbsIntegration({ console: false }),
  ],
});
