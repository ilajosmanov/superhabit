# plugins

Expo config plugins of our own, listed in `app.json`. They change the generated `android/` (never edited
by hand) on `expo prebuild`.

| File              | Does                                                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `backup-rules.js` | Android backup: the database (and preferences) in cloud backup, every file in device transfer; secure storage stays out |
