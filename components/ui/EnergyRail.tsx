import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/constants/Theme';

interface Props {
  value: number;
  target: number;
}

export function EnergyRail({ value, target }: Props) {
  const rawProgress = target > 0 ? value / target : 0;
  const progress = Math.min(1, Math.max(0, rawProgress));
  const markerPosition = `${Math.min(98, Math.max(2, progress * 100))}%` as `${number}%`;
  const over = value > target;

  return (
    <View style={styles.wrapper}>
      <View style={styles.labels}>
        <Text style={styles.label}>0</Text>
        <Text style={styles.targetLabel}>目标 {Math.round(target)}</Text>
      </View>
      <View style={styles.rail}>
        <View
          style={[
            styles.fill,
            {
              width: `${progress * 100}%`,
              backgroundColor: over ? theme.colors.accent : theme.colors.primary,
            },
          ]}
        />
        <View style={styles.warningZone} />
        {[20, 40, 60, 80].map((tick) => (
          <View key={tick} style={[styles.tick, { left: `${tick}%` }]} />
        ))}
        <View
          style={[
            styles.marker,
            { left: markerPosition },
            over && styles.markerOver,
          ]}
        />
      </View>
      <View style={styles.captionRow}>
        <Text style={styles.caption}>已摄入 {Math.round(value)} kcal</Text>
        <Text style={[styles.caption, over && styles.overText]}>
          {over ? `超出 ${Math.round(value - target)}` : `${Math.round(target - value)} 可用`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 7,
  },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    color: theme.colors.textFaint,
    fontSize: 10,
    fontWeight: '700',
  },
  targetLabel: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
  },
  rail: {
    height: 20,
    borderRadius: 4,
    overflow: 'visible',
    backgroundColor: theme.colors.surfaceMuted,
  },
  fill: {
    height: '100%',
    borderRadius: 4,
  },
  warningZone: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: '8%',
    backgroundColor: 'rgba(255, 90, 61, 0.12)',
  },
  tick: {
    position: 'absolute',
    top: 5,
    bottom: 5,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  marker: {
    position: 'absolute',
    top: -4,
    width: 3,
    height: 28,
    borderRadius: 2,
    backgroundColor: theme.colors.ink,
  },
  markerOver: {
    backgroundColor: theme.colors.danger,
  },
  captionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  caption: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  overText: {
    color: theme.colors.danger,
  },
});
