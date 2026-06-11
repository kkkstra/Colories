import type { PropsWithChildren } from 'react';
import {
  Platform,
  ScrollView,
  type ScrollViewProps,
  StyleSheet,
} from 'react-native';
import Animated, { Easing, FadeIn, LinearTransition } from 'react-native-reanimated';
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
        <Animated.View
          entering={FadeIn.duration(140).easing(Easing.out(Easing.cubic))}
          layout={LinearTransition.duration(160).easing(Easing.out(Easing.cubic))}
          style={[styles.content, { paddingBottom: bottomClearance }, contentContainerStyle]}
        >
          {children}
        </Animated.View>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={styles.safe} edges={edges}>
      <ScrollView
        {...props}
        contentInsetAdjustmentBehavior={props.contentInsetAdjustmentBehavior ?? 'automatic'}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: bottomClearance }}
      >
        <Animated.View
          entering={FadeIn.duration(120).easing(Easing.out(Easing.cubic))}
          layout={LinearTransition.duration(160).easing(Easing.out(Easing.cubic))}
          style={[styles.content, contentContainerStyle]}
        >
          {children}
        </Animated.View>
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
