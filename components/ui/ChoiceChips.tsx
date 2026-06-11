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
}

export function ChoiceChips<T extends string>({ options, value, onChange }: Props<T>) {
  return (
    <View style={styles.row}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.chip, selected && styles.selected]}
          >
            {option.icon ? (
              <Ionicons
                name={option.icon}
                size={17}
                color={selected ? '#FFFFFF' : theme.colors.textMuted}
              />
            ) : null}
            <Text style={[styles.label, selected && styles.selectedLabel]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  chip: {
    borderRadius: theme.radius.small,
    minHeight: 40,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    justifyContent: 'center',
  },
  selected: {
    backgroundColor: theme.colors.ink,
    borderColor: theme.colors.ink,
  },
  label: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  selectedLabel: {
    color: '#FFFFFF',
  },
});
