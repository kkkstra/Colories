import { Children, isValidElement, type PropsWithChildren, type Ref } from 'react';
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
    scrollRef?: Ref<ScrollView>;
    topSafe?: boolean;
    stickyHeaderKeys?: string[];
  }
>;

export function Screen({
  children,
  scroll = true,
  scrollRef,
  topSafe = true,
  stickyHeaderKeys,
  contentContainerStyle,
  ...props
}: Props) {
  const insets = useSafeAreaInsets();
  const bottomClearance = FLOATING_TAB_CLEARANCE + Math.max(insets.bottom, 14);
  const edges = topSafe ? ['top' as const] : [];
  const activeStickyHeaderKeys = stickyHeaderKeys ?? [];
  const stickyChildren = activeStickyHeaderKeys.length ? Children.toArray(children) : null;
  const stickyHeaderIndices = stickyChildren
    ? activeStickyHeaderKeys
        .map((key) =>
          stickyChildren.findIndex((child) => isValidElement(child) && String(child.key).includes(key)),
        )
        .filter((index) => index >= 0)
    : undefined;

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
  if (stickyChildren) {
    return (
      <SafeAreaView style={styles.safe} edges={edges}>
        <ScrollView
          {...props}
          ref={scrollRef}
          contentInsetAdjustmentBehavior={props.contentInsetAdjustmentBehavior ?? 'automatic'}
          keyboardShouldPersistTaps="handled"
          stickyHeaderIndices={stickyHeaderIndices}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: bottomClearance },
            contentContainerStyle,
          ]}
        >
          {stickyChildren}
        </ScrollView>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={styles.safe} edges={edges}>
      <ScrollView
        {...props}
        ref={scrollRef}
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
    paddingTop: Platform.OS === 'web' ? 26 : 14,
    gap: 16,
  },
});
