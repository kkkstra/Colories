import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { theme } from '@/constants/Theme';
import type { MealItemDraft, NutritionSource } from '@/types/domain';

const SOURCE_LABELS: Record<NutritionSource, string> = {
  catalog: '营养库',
  ai: 'AI 估算',
  manual: '手动',
};

interface Props {
  item: MealItemDraft;
  onChange: (item: MealItemDraft) => void;
  onRemove: () => void;
}

export function MealItemEditor({ item, onChange, onRemove }: Props) {
  const setNumber = (
    key: 'weightGrams' | 'calories' | 'protein' | 'carbs' | 'fat',
    value: string,
  ) => {
    const parsed = Number(value);
    onChange({ ...item, [key]: Number.isFinite(parsed) ? Math.max(0, parsed) : 0 });
  };

  return (
    <Card>
      <View style={styles.header}>
        <TextInput
          value={item.name}
          onChangeText={(name) => onChange({ ...item, name })}
          style={styles.name}
          placeholder="食物名称"
        />
        <Pressable onPress={onRemove} hitSlop={10}>
          <Ionicons name="trash-outline" size={20} color={theme.colors.danger} />
        </Pressable>
      </View>

      <View style={styles.meta}>
        <View style={[styles.badge, item.source === 'ai' && styles.aiBadge]}>
          <Text style={[styles.badgeText, item.source === 'ai' && styles.aiBadgeText]}>
            {SOURCE_LABELS[item.source]}
          </Text>
        </View>
        {typeof item.confidence === 'number' ? (
          <Text style={styles.confidence}>置信度 {Math.round(item.confidence * 100)}%</Text>
        ) : null}
        {item.cookingMethod ? <Text style={styles.confidence}>{item.cookingMethod}</Text> : null}
      </View>

      {item.warning ? <Text style={styles.warning}>{item.warning}</Text> : null}

      <View style={styles.fields}>
        <NumberField
          label="重量 g"
          value={item.weightGrams}
          onChange={(value) => setNumber('weightGrams', value)}
        />
        <NumberField
          label="热量 kcal"
          value={item.calories}
          onChange={(value) => setNumber('calories', value)}
        />
        <NumberField
          label="蛋白质 g"
          value={item.protein}
          onChange={(value) => setNumber('protein', value)}
        />
        <NumberField
          label="碳水 g"
          value={item.carbs}
          onChange={(value) => setNumber('carbs', value)}
        />
        <NumberField
          label="脂肪 g"
          value={item.fat}
          onChange={(value) => setNumber('fat', value)}
        />
      </View>
    </Card>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.numberField}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={String(value)}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        style={styles.input}
        selectTextOnFocus
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  name: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '800',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    paddingVertical: 6,
  },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    borderRadius: 999,
    backgroundColor: theme.colors.primarySoft,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  badgeText: {
    color: theme.colors.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  aiBadge: {
    backgroundColor: '#FFF0E4',
  },
  aiBadgeText: {
    color: theme.colors.warning,
  },
  confidence: {
    color: theme.colors.textMuted,
    fontSize: 11,
  },
  warning: {
    color: theme.colors.warning,
    backgroundColor: '#FFF8EA',
    borderRadius: 8,
    padding: 9,
    fontSize: 12,
    lineHeight: 18,
  },
  fields: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  numberField: {
    width: '30%',
    minWidth: 92,
    flexGrow: 1,
    gap: 4,
  },
  fieldLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
  },
  input: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 9,
    paddingHorizontal: 10,
    color: theme.colors.text,
    backgroundColor: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
});
