import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/constants/Theme';

interface Props {
  value: number;
  target: number;
}

export function EnergyRail({ value, target }: Props) {
  const displayMax = target > 0 ? Math.max(target, value) : Math.max(1, value);
  const rawProgress = displayMax > 0 ? value / displayMax : 0;
  const progress = Math.min(1, Math.max(0, rawProgress));
  const over = value > target;
  const targetProgress = target > 0 ? Math.min(1, Math.max(0, target / displayMax)) : 1;
  const targetPosition = `${Math.min(98, Math.max(2, targetProgress * 100))}%` as `${number}%`;
  const usedWidth = `${Math.min(progress, targetProgress) * 100}%` as `${number}%`;
  const overLeft = `${targetProgress * 100}%` as `${number}%`;
  const overWidth = `${Math.max(0, progress - targetProgress) * 100}%` as `${number}%`;

  return (
    <View
      accessibilityLabel={`已摄入 ${Math.round(value)} 千卡，目标 ${Math.round(target)} 千卡`}
      style={styles.wrapper}
    >
      <View style={styles.rail}>
        <View style={styles.railTrack}>
          <View
            style={[
              styles.fill,
              {
                width: usedWidth,
                backgroundColor: theme.colors.primary,
              },
            ]}
          />
          {over ? (
            <View style={[styles.overFill, { left: overLeft, width: overWidth }]} />
          ) : (
            <View style={styles.warningZone} />
          )}
          {[20, 40, 60, 80].map((tick) => (
            <View key={tick} style={[styles.tick, { left: `${tick}%` }]} />
          ))}
          <View style={[styles.targetLine, { left: targetPosition }, over && styles.targetLineOver]}>
            <View style={[styles.targetLineGlow, over && styles.targetLineGlowOver]} />
          </View>
        </View>
      </View>
      <View style={styles.captionRow}>
        <Text style={styles.caption}>已摄入 {Math.round(value)}</Text>
        <View style={styles.captionRight}>
          <Text style={styles.limitCaption}>上限 {Math.round(target)}</Text>
          {over ? (
            <Text style={[styles.caption, styles.overText]}>
              +{Math.round(value - target)} 超出
            </Text>
          ) : null}
        </View>
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
  },
  railTrack: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(16, 24, 40, 0.05)',
  },
  fill: {
    height: '100%',
    borderRadius: 8,
  },
  overFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: 8,
    backgroundColor: theme.colors.accent,
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
  targetLine: {
    position: 'absolute',
    top: -5,
    bottom: -5,
    width: 3,
    marginLeft: -1.5,
    borderRadius: 2,
    backgroundColor: theme.colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 2px 6px rgba(16, 24, 40, 0.24)',
  },
  targetLineOver: {
    backgroundColor: theme.colors.danger,
  },
  targetLineGlow: {
    position: 'absolute',
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: 'rgba(16, 24, 40, 0.12)',
  },
  targetLineGlowOver: {
    backgroundColor: 'rgba(217, 45, 32, 0.18)',
  },
  captionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  captionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    flexShrink: 1,
  },
  caption: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  limitCaption: {
    color: theme.colors.text,
    fontSize: 11,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  overText: {
    color: theme.colors.danger,
  },
});
