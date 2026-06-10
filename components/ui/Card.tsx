import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';

import { theme } from '@/constants/Theme';

export function Card({ style, children, ...props }: PropsWithChildren<ViewProps>) {
  return (
    <View style={[styles.card, style]} {...props}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 18,
    gap: 12,
  },
});
