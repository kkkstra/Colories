import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/constants/Theme';

interface Props {
  label: string;
  value: number;
  target: number;
  color: string;
  unit?: string;
}

export function ProgressBar({ label, value, target, color, unit = 'g' }: Props) {
  const progress = target > 0 ? Math.min(1, value / target) : 0;
  return (
    <View style={styles.wrapper}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>
          {Math.round(value)} / {Math.round(target)} {unit}
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { backgroundColor: color, width: `${progress * 100}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 7,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  label: {
    color: theme.colors.text,
    fontWeight: '600',
  },
  value: {
    color: theme.colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  track: {
    height: 8,
    borderRadius: 99,
    backgroundColor: theme.colors.surfaceMuted,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 99,
  },
});
