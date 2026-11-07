import { Alert } from 'react-native';

/** A change to your challenges couldn't be written (the phone is full); nothing changed. */
export const saveFailed = () =>
  Alert.alert("Couldn't save", 'The phone has no room left. Free some space and try again.');
