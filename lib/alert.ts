import { Alert, Platform, type AlertButton } from 'react-native';

export function showAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[],
): void {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }

  const text = [title, message].filter(Boolean).join('\n\n');
  const actions = buttons?.filter((button) => button.style !== 'cancel') ?? [];
  const hasCancel = buttons?.some((button) => button.style === 'cancel') ?? false;

  if (hasCancel && actions.length === 1) {
    if (globalThis.confirm(text)) {
      void actions[0].onPress?.();
    }
    return;
  }

  globalThis.alert(text);
  if (actions.length === 1) {
    void actions[0].onPress?.();
  }
}
