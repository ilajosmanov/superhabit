import { Alert } from 'react-native';

/** A write didn't go through (the phone is likely full); nothing was lost, so trying again can work. */
export const saveFailed = () =>
  Alert.alert("Couldn't save", 'The phone may be out of space. Free some up and try again.');
