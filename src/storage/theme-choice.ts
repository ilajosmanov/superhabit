import Storage from 'expo-sqlite/kv-store';

const KEY = 'theme';

export const THEME_CHOICES = ['light', 'dark', 'system'] as const;
/** Which palette the app wears: the phone's, or one you picked on Profile. */
export type ThemeChoice = (typeof THEME_CHOICES)[number];

/**
 * Kept outside the database: it is the phone's, not the account's, so signing out leaves it, and it is
 * read before the database opens, so the first frame already wears it.
 */
export function themeChoice(): ThemeChoice {
  const kept = Storage.getItemSync(KEY);
  return THEME_CHOICES.find((choice) => choice === kept) ?? 'system';
}

export const keepThemeChoice = (choice: ThemeChoice) => Storage.setItemSync(KEY, choice);
