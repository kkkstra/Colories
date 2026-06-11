import { StyleSheet, Text, TextInput, type TextInputProps, View } from 'react-native';

import { theme } from '@/constants/Theme';

interface Props extends TextInputProps {
  label: string;
  hint?: string;
}

export function FormField({ label, hint, style, ...props }: Props) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={theme.colors.textMuted}
        style={[styles.input, style]}
        {...props}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 7,
  },
  label: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    borderRadius: theme.radius.small,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.surfaceInset,
    paddingHorizontal: 14,
    color: theme.colors.text,
    fontSize: 16,
    boxShadow: 'inset 0 1px 0 rgba(16, 24, 40, 0.03)',
  },
  hint: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
});
