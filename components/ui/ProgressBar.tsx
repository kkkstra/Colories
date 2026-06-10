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
  const percentage = target > 0 ? Math.round((value / target) * 100) : 0;
  return (
    <View style={styles.wrapper}>
      <View style={styles.labelRow}>
        <View style={styles.labelGroup}>
          <View style={[styles.swatch, { backgroundColor: color }]} />
          <Text style={styles.label}>{label}</Text>
        </View>
        <Text style={styles.value}>
          <Text style={styles.valueStrong}>{Math.round(value)}</Text>
          {' / '}
          {Math.round(target)} {unit}
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { backgroundColor: color, width: `${progress * 100}%` }]} />
      </View>
      <Text style={styles.percent}>{percentage}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 6,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  labelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  swatch: {
    width: 7,
    height: 7,
    borderRadius: 2,
  },
  label: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  value: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  valueStrong: {
    color: theme.colors.text,
    fontWeight: '800',
  },
  track: {
    height: 6,
    borderRadius: 2,
    backgroundColor: theme.colors.surfaceMuted,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 2,
  },
  percent: {
    display: 'none',
  },
});
