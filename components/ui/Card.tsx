import type { PropsWithChildren } from 'react';
import { StyleSheet, type ViewProps } from 'react-native';
import Animated, { Easing, FadeIn, LinearTransition } from 'react-native-reanimated';

import { theme } from '@/constants/Theme';

export function Card({ style, children, ...props }: PropsWithChildren<ViewProps>) {
  return (
    <Animated.View
      entering={FadeIn.duration(120).easing(Easing.out(Easing.cubic))}
      layout={LinearTransition.duration(160).easing(Easing.out(Easing.cubic))}
      style={[styles.card, style]}
      {...props}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    gap: 14,
  },
});
