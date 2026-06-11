import type { PropsWithChildren } from 'react';
import {
  Platform,
  ScrollView,
  type ScrollViewProps,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '@/constants/Theme';

const FLOATING_TAB_CLEARANCE = 92;

type Props = PropsWithChildren<
  ScrollViewProps & {
    scroll?: boolean;
    topSafe?: boolean;
  }
>;

export function Screen({
  children,
  scroll = true,
  topSafe = true,
  contentContainerStyle,
  ...props
}: Props) {
  const insets = useSafeAreaInsets();
  const bottomClearance = FLOATING_TAB_CLEARANCE + Math.max(insets.bottom, 14);
  const edges = topSafe ? ['top' as const] : [];

  if (!scroll) {
    return (
      <SafeAreaView style={styles.safe} edges={edges}>
        <View style={[styles.content, { paddingBottom: bottomClearance }, contentContainerStyle]}>
          {children}
        </View>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={styles.safe} edges={edges}>
      <ScrollView
        {...props}
        contentInsetAdjustmentBehavior={props.contentInsetAdjustmentBehavior ?? 'automatic'}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          { paddingBottom: bottomClearance },
          contentContainerStyle,
        ]}
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
    gap: 14,
  },
});
