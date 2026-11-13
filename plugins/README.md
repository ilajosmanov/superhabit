# plugins

Expo config plugins of our own, listed in `app.json`. They change the generated `android/` and `ios/` (never edited
by hand) on `expo prebuild`.

| File               | Does                                                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `backup-rules.js`  | Android backup: the database (and preferences) in cloud backup, every file in device transfer; secure storage stays out |
| `mediapipe-gtm.js` | iOS: drops the GTMSessionFetcher pod from the app's link, since MediaPipe's force-loaded library already carries it     |
