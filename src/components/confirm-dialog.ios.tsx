import { Alert, Button, Host, Text } from '@expo/ui/swift-ui';
import { disabled as off } from '@expo/ui/swift-ui/modifiers';
import { useRef } from 'react';

/**
 * iOS's alert for a choice: the action (destructive red when it can't be undone), and Cancel or another word.
 * iOS alerts have no tap outside, so `onDismiss` only runs if the system closes it.
 */
export function ConfirmDialog({
  title,
  text,
  action,
  warn = true,
  cancel = 'Cancel',
  disabled = false,
  onConfirm,
  onCancel,
  onDismiss = onCancel,
}: {
  title: string;
  text: string;
  /** The action button's word ("Leave", "Discard", "Save"). */
  action: string;
  /** The action can't be undone: it is red. */
  warn?: boolean;
  /** The other button's word. */
  cancel?: string;
  /** Its action is running: both buttons are off. */
  disabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onDismiss?: () => void;
}) {
  // A button press also closes the alert; only a close without one is a dismissal.
  const pressed = useRef(false);
  return (
    // Out of the layout's flow: the alert draws over everything, but its host would take a slot.
    <Host matchContents style={{ position: 'absolute' }}>
      <Alert
        title={title}
        isPresented
        onIsPresentedChange={(shown) => {
          if (!shown && !pressed.current) onDismiss();
        }}
      >
        <Alert.Trigger>
          <Text> </Text>
        </Alert.Trigger>
        <Alert.Actions>
          <Button
            label={cancel}
            role="cancel"
            onPress={() => {
              pressed.current = true;
              onCancel();
            }}
            modifiers={[off(disabled)]}
          />
          <Button
            label={action}
            role={warn ? 'destructive' : 'default'}
            onPress={() => {
              pressed.current = true;
              onConfirm();
            }}
            modifiers={[off(disabled)]}
          />
        </Alert.Actions>
        <Alert.Message>
          <Text>{text}</Text>
        </Alert.Message>
      </Alert>
    </Host>
  );
}
