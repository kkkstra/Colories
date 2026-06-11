import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '@/constants/Theme';

type Props = {
  title?: string;
  compactTopInset?: boolean;
  headerRight?: ReactNode | ((props: { tintColor: string }) => ReactNode);
};

type HeaderIconButtonProps = {
  accessibilityLabel: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  variant?: 'primary' | 'danger' | 'secondary';
  loading?: boolean;
  disabled?: boolean;
};

export function AppHeader({ title, compactTopInset = false, headerRight }: Props) {
  const insets = useSafeAreaInsets();
  const topInset =
    compactTopInset && Platform.OS !== 'android'
      ? Math.min(insets.top, 14)
      : Math.max(insets.top, Platform.OS === 'android' ? 24 : 0);
  const rightContent =
    typeof headerRight === 'function'
      ? headerRight({ tintColor: theme.colors.primary })
      : headerRight;

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/');
  };

  return (
    <View style={[styles.header, { paddingTop: topInset }]}>
      <View style={styles.row}>
        <View style={styles.side}>
          <Pressable
            accessibilityLabel="返回上一页"
            accessibilityRole="button"
            hitSlop={10}
            onPress={handleBack}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          >
            <Ionicons name="chevron-back" size={25} color={theme.colors.primary} />
          </Pressable>
        </View>
        <Text numberOfLines={1} style={styles.title}>
          {title}
        </Text>
        <View style={[styles.side, styles.rightSide]}>{rightContent}</View>
      </View>
    </View>
  );
}

export function HeaderIconButton({
  accessibilityLabel,
  icon,
  onPress,
  variant = 'secondary',
  loading = false,
  disabled = false,
}: HeaderIconButtonProps) {
  const foreground =
    variant === 'primary'
      ? '#FFFFFF'
      : variant === 'danger'
        ? theme.colors.danger
        : theme.colors.primary;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      disabled={disabled || loading}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        styles.headerIconButton,
        styles[`${variant}HeaderIconButton`],
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={foreground} size="small" />
      ) : (
        <Ionicons name={icon} size={20} color={foreground} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: theme.colors.surfaceRaised,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderSoft,
    boxShadow: '0 8px 20px rgba(16, 24, 40, 0.05)',
  },
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  side: {
    width: 108,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rightSide: {
    justifyContent: 'flex-end',
    gap: 8,
  },
  backButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: theme.colors.surfaceInset,
  },
  title: {
    flex: 1,
    paddingHorizontal: 14,
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0,
    textAlign: 'center',
  },
  headerIconButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    borderCurve: 'continuous',
    borderWidth: 1,
  },
  primaryHeaderIconButton: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
    boxShadow: theme.shadows.primary,
  },
  dangerHeaderIconButton: {
    backgroundColor: theme.colors.accentSoft,
    borderColor: '#FFD1C6',
  },
  secondaryHeaderIconButton: {
    backgroundColor: theme.colors.surfaceInset,
    borderColor: theme.colors.borderSoft,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.72,
    transform: [{ translateY: 1 }],
  },
});
