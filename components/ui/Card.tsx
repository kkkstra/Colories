import type { PropsWithChildren } from 'react';
import { StyleSheet, type ViewProps } from 'react-native';
import Animated, { Easing, FadeIn, LinearTransition } from 'react-native-reanimated';

import { theme } from '@/constants/Theme';

type CardVariant = 'raised' | 'base' | 'prominent' | 'inset';

type Props = PropsWithChildren<
  ViewProps & {
    variant?: CardVariant;
  }
>;

export function Card({ style, children, variant = 'raised', ...props }: Props) {
  return (
    <Animated.View
      entering={FadeIn.duration(120).easing(Easing.out(Easing.cubic))}
      layout={LinearTransition.duration(160).easing(Easing.out(Easing.cubic))}
      style={[styles.card, styles[variant], style]}
      {...props}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surfaceRaised,
    borderRadius: theme.radius.medium,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    padding: 16,
    gap: 14,
  },
  raised: {
    boxShadow: theme.shadows.medium,
  },
  base: {
    boxShadow: theme.shadows.small,
  },
  prominent: {
    borderColor: '#FFFFFF',
    boxShadow: theme.shadows.large,
  },
  inset: {
    backgroundColor: theme.colors.surfaceInset,
    borderColor: theme.colors.border,
  },
});
