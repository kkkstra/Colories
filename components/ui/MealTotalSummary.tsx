import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/constants/Theme';
import type { MacroValues } from '@/types/domain';

interface Props {
  totals: MacroValues;
}

export function MealTotalSummary({ totals }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.left}>
        <Text style={styles.label}>本餐合计</Text>
        <View style={styles.macroRow}>
          <MacroValue label="蛋" value={totals.protein} color={theme.colors.protein} />
          <MacroValue label="碳" value={totals.carbs} color={theme.colors.carbs} />
          <MacroValue label="脂" value={totals.fat} color={theme.colors.fat} />
        </View>
      </View>
      <View style={styles.right}>
        <Text style={styles.calories}>{Math.round(totals.calories)}</Text>
        <Text style={styles.unit}>kcal</Text>
      </View>
    </View>
  );
}

function MacroValue({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.macroValue}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.macroLabel}>{label}</Text>
      <Text style={styles.macroNumber}>{Math.round(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.ink,
    borderRadius: 18,
    borderCurve: 'continuous',
    paddingHorizontal: 18,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    boxShadow: theme.shadows.large,
  },
  left: {
    flex: 1,
    minWidth: 0,
    gap: 9,
  },
  label: {
    color: '#AEB9CD',
    fontSize: 11,
    fontWeight: '900',
  },
  macroRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 9,
  },
  macroValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  macroLabel: {
    color: '#D0D5DD',
    fontSize: 11,
    fontWeight: '900',
  },
  macroNumber: {
    color: '#F2F4F7',
    fontSize: 12,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  right: {
    alignItems: 'flex-end',
  },
  calories: {
    color: '#FFFFFF',
    fontSize: 34,
    lineHeight: 36,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  unit: {
    color: '#AEB9CD',
    fontSize: 10,
    fontWeight: '800',
  },
});
