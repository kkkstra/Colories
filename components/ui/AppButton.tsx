import Ionicons from '@expo/vector-icons/Ionicons';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type ViewStyle,
} from 'react-native';

import { theme } from '@/constants/Theme';

interface Props {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  icon?: keyof typeof Ionicons.glyphMap;
}

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
  icon,
}: Props) {
  const foreground =
    variant === 'secondary'
      ? theme.colors.primary
      : variant === 'danger'
        ? '#FFFFFF'
        : '#FFFFFF';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={19} color={foreground} /> : null}
          <Text
            style={[
              styles.label,
              variant === 'secondary' && styles.secondaryLabel,
            ]}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: 12,
    paddingHorizontal: 18,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  primary: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  secondary: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.borderStrong,
  },
  danger: {
    backgroundColor: theme.colors.danger,
    borderColor: theme.colors.danger,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    transform: [{ translateY: 1 }],
    opacity: 0.9,
  },
  label: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.1,
  },
  secondaryLabel: {
    color: theme.colors.primary,
  },
});
