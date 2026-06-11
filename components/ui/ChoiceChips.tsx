import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type DimensionValue,
  type LayoutChangeEvent,
} from 'react-native';

import { theme } from '@/constants/Theme';

interface Option<T extends string> {
  label: string;
  value: T;
  icon?: keyof typeof Ionicons.glyphMap;
}

interface Props<T extends string> {
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  adaptive?: boolean;
  minColumnWidth?: number;
  columns?: 2 | 3 | 4;
}

const CHIP_GAP = 7;

export function ChoiceChips<T extends string>({
  options,
  value,
  onChange,
  adaptive = false,
  minColumnWidth = 74,
  columns,
}: Props<T>) {
  const [containerWidth, setContainerWidth] = useState(0);
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    setContainerWidth((currentWidth) =>
      Math.abs(currentWidth - nextWidth) < 1 ? currentWidth : nextWidth,
    );
  }, []);

  return (
    <View
      style={styles.row}
      onLayout={adaptive && columns ? handleLayout : undefined}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <ChoiceChip
            key={option.value}
            option={option}
            selected={selected}
            onPress={() => onChange(option.value)}
            adaptive={adaptive}
            minColumnWidth={minColumnWidth}
            columns={columns}
            fixedBasis={
              adaptive && columns && containerWidth > 0
                ? fixedColumnBasis(containerWidth, columns, index)
                : undefined
            }
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
  columns,
  fixedBasis,
}: {
  option: Option<T>;
  selected: boolean;
  onPress: () => void;
  adaptive?: boolean;
  minColumnWidth?: number;
  columns?: 2 | 3 | 4;
  fixedBasis?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.chip,
        adaptive && (columns ? styles.fixedGridChip : styles.adaptiveChip),
        adaptive && {
          flexBasis: columns ? fixedBasis ?? columnBasis(columns) : minColumnWidth,
        },
        selected && styles.selected,
      ]}
    >
      {option.icon ? (
        <Ionicons
          name={option.icon}
          size={columns === 4 ? 15 : 17}
          color={selected ? '#FFFFFF' : theme.colors.textMuted}
        />
      ) : null}
      <Text
        numberOfLines={1}
        style={[
          styles.label,
          adaptive && styles.adaptiveLabel,
          columns === 4 && styles.compactLabel,
          selected && styles.selectedLabel,
        ]}
      >
        {option.label}
      </Text>
    </Pressable>
  );
}

function columnBasis(columns: 2 | 3 | 4): DimensionValue {
  if (columns === 2) {
    return '48.5%';
  }
  if (columns === 4) {
    return '22%';
  }
  return '31.4%';
}

function fixedColumnBasis(containerWidth: number, columns: 2 | 3 | 4, index: number): number {
  const usableWidth = containerWidth - CHIP_GAP * (columns - 1);
  const baseWidth = Math.floor(usableWidth / columns);
  const remainder = Math.max(0, Math.round(usableWidth - baseWidth * columns));
  return Math.max(0, baseWidth + (index % columns < remainder ? 1 : 0));
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CHIP_GAP,
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
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    paddingHorizontal: 8,
  },
  fixedGridChip: {
    flexGrow: 0,
    flexShrink: 0,
    minWidth: 0,
    paddingHorizontal: 6,
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
  compactLabel: {
    fontSize: 12,
  },
});
