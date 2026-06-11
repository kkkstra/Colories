import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/constants/Theme';

interface Option<T extends string> {
  label: string;
  value: T;
  icon?: keyof typeof Ionicons.glyphMap;
}

interface Props<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  adaptive?: boolean;
  minColumnWidth?: number;
}

export function ChoiceChips<T extends string>({
  options,
  value,
  onChange,
  adaptive = false,
  minColumnWidth = 74,
}: Props<T>) {
  return (
    <View style={styles.row}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <ChoiceChip
            key={option.value}
            option={option}
            selected={selected}
            onPress={() => onChange(option.value)}
            adaptive={adaptive}
            minColumnWidth={minColumnWidth}
          />
        );
      })}
    </View>
  );
}

function ChoiceChip<T extends string>({
  option,
  selected,
  onPress,
  adaptive = false,
  minColumnWidth,
}: {
  option: Option<T>;
  selected: boolean;
  onPress: () => void;
  adaptive?: boolean;
  minColumnWidth?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.chip,
        adaptive && styles.adaptiveChip,
        adaptive && { flexBasis: minColumnWidth },
        selected && styles.selected,
      ]}
    >
      {option.icon ? (
        <Ionicons
          name={option.icon}
          size={17}
          color={selected ? '#FFFFFF' : theme.colors.textMuted}
        />
      ) : null}
      <Text
        numberOfLines={1}
        style={[styles.label, adaptive && styles.adaptiveLabel, selected && styles.selectedLabel]}
      >
        {option.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  chip: {
    borderRadius: 12,
    borderCurve: 'continuous',
    minHeight: 40,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: theme.colors.surfaceInset,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    justifyContent: 'center',
  },
  adaptiveChip: {
    flexGrow: 0,
    flexShrink: 0,
    minWidth: 0,
    paddingHorizontal: 8,
  },
  selected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
    boxShadow: '0 8px 18px rgba(39, 93, 255, 0.18)',
  },
  label: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 1,
  },
  adaptiveLabel: {
    fontWeight: '800',
  },
  selectedLabel: {
    color: '#FFFFFF',
  },
});
