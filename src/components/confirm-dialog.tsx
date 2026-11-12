import {
  AlertDialog,
  Host,
  Text as ComposeText,
  TextButton as ComposeTextButton,
} from '@expo/ui/jetpack-compose';

import { COMPOSE_LABEL } from '@/theme';
import { useColors } from './colors';

/**
 * The platform's dialog for a choice: the action (red when it can't be undone), and Cancel or another
 * word. A tap outside cancels, unless `onDismiss` says otherwise (a choice that must be made).
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
  const colors = useColors();
  return (
    // Out of the layout's flow: the dialog draws in its own window, but its host would take a slot.
    <Host matchContents style={{ position: 'absolute' }}>
      <AlertDialog
        onDismissRequest={onDismiss}
        colors={{
          containerColor: colors.surface,
          titleContentColor: colors.chalk,
          textContentColor: colors.soft,
        }}
      >
        <AlertDialog.Title>
          <ComposeText style={{ fontFamily: 'Geist', fontSize: 22 }}>{title}</ComposeText>
        </AlertDialog.Title>
        <AlertDialog.Text>
          <ComposeText style={{ fontFamily: 'Geist', fontSize: 15 }}>{text}</ComposeText>
        </AlertDialog.Text>
        <AlertDialog.ConfirmButton>
          <ComposeTextButton onClick={onConfirm} enabled={!disabled}>
            <ComposeText
              color={disabled ? colors.muted : warn ? colors.warn : colors.mark}
              style={COMPOSE_LABEL}
            >
              {action}
            </ComposeText>
          </ComposeTextButton>
        </AlertDialog.ConfirmButton>
        <AlertDialog.DismissButton>
          <ComposeTextButton onClick={onCancel} enabled={!disabled}>
            <ComposeText color={disabled ? colors.muted : colors.chalk} style={COMPOSE_LABEL}>
              {cancel}
            </ComposeText>
          </ComposeTextButton>
        </AlertDialog.DismissButton>
      </AlertDialog>
    </Host>
  );
}
