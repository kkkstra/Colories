import type { PropsWithChildren } from 'react';
import {
  Platform,
  ScrollView,
  type ScrollViewProps,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '@/constants/Theme';

type Props = PropsWithChildren<
  ScrollViewProps & {
    scroll?: boolean;
  }
>;

export function Screen({ children, scroll = true, contentContainerStyle, ...props }: Props) {
  if (!scroll) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={[styles.content, contentContainerStyle]}>{children}</View>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        {...props}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, contentContainerStyle]}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'web' ? 24 : 12,
    paddingBottom: 108,
    gap: 14,
  },
});
