import { StyleSheet, View } from 'react-native';

import { theme } from '@/constants/Theme';

interface Props {
  protein: number;
  carbs: number;
  fat: number;
}

export function MacroStrip({ protein, carbs, fat }: Props) {
  const total = Math.max(1, protein + carbs + fat);

  return (
    <View
      accessibilityLabel={`蛋白质 ${Math.round(protein)} 克，碳水 ${Math.round(carbs)} 克，脂肪 ${Math.round(fat)} 克`}
      style={styles.track}
    >
      <View
        style={[
          styles.segment,
          { backgroundColor: theme.colors.protein, flex: Math.max(0.08, protein / total) },
        ]}
      />
      <View
        style={[
          styles.segment,
          { backgroundColor: theme.colors.carbs, flex: Math.max(0.08, carbs / total) },
        ]}
      />
      <View
        style={[
          styles.segment,
          { backgroundColor: theme.colors.fat, flex: Math.max(0.08, fat / total) },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 7,
    flexDirection: 'row',
    gap: 3,
  },
  segment: {
    minWidth: 6,
    borderRadius: 4,
    boxShadow: 'inset 0 -1px 0 rgba(16, 24, 40, 0.08)',
  },
});
