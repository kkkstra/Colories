import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '@/constants/Theme';

type Props = {
  title?: string;
  compactTopInset?: boolean;
};

export function AppHeader({ title, compactTopInset = false }: Props) {
  const insets = useSafeAreaInsets();
  const topInset = compactTopInset ? Math.min(insets.top, 14) : insets.top;

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
        <Pressable
          accessibilityLabel="返回上一页"
          accessibilityRole="button"
          hitSlop={10}
          onPress={handleBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-back" size={25} color={theme.colors.primary} />
        </Pressable>
        <Text numberOfLines={1} style={styles.title}>
          {title}
        </Text>
        <View style={styles.sidePlaceholder} />
      </View>
    </View>
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
    paddingHorizontal: 20,
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
  sidePlaceholder: {
    width: 48,
    height: 48,
  },
  pressed: {
    opacity: 0.72,
    transform: [{ translateY: 1 }],
  },
});
