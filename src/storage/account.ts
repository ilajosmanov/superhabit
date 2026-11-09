import { Directory, Paths } from 'expo-file-system';

// shortcut: one local account until sign-in arrives (piece 4); then the signed-in user's id.
/** Whose data this is: stamped on what is kept, and the name of their folder. */
export const userId = () => 'local';

/** The account's own folder in the app's documents (documents/<userId>/). */
export const accountDir = () => new Directory(Paths.document, userId());
