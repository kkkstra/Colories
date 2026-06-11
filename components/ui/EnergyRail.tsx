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
    <View
      accessibilityLabel={`已摄入 ${Math.round(value)} 千卡，目标 ${Math.round(target)} 千卡`}
      style={styles.wrapper}
    >
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
        <Text style={styles.caption}>{Math.round(value)} 已用</Text>
        <Text style={[styles.caption, over && styles.overText]}>
          {over ? `+${Math.round(value - target)} 超出` : `${Math.round(target)} 目标`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 8,
  },
  rail: {
    height: 15,
    borderRadius: 8,
    overflow: 'visible',
    backgroundColor: theme.colors.surfaceMuted,
    boxShadow: 'inset 0 1px 2px rgba(16, 24, 40, 0.08)',
  },
  fill: {
    height: '100%',
    borderRadius: 8,
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
    top: 4,
    bottom: 4,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  marker: {
    position: 'absolute',
    top: -3,
    width: 2,
    height: 20,
    borderRadius: 2,
    backgroundColor: theme.colors.ink,
    boxShadow: '0 2px 5px rgba(16, 24, 40, 0.22)',
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
    fontSize: 10,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  overText: {
    color: theme.colors.danger,
  },
});
