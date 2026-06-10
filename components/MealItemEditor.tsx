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
    <Card style={styles.card}>
      <View style={styles.sourceRow}>
        <View
          style={[
            styles.sourceMark,
            item.source === 'ai' && styles.sourceMarkAi,
            item.source === 'manual' && styles.sourceMarkManual,
          ]}
        >
          <Text style={styles.sourceMarkText}>
            {item.source === 'catalog' ? 'DB' : item.source === 'ai' ? 'AI' : 'ME'}
          </Text>
        </View>
        <View style={styles.sourceCopy}>
          <Text style={styles.sourceLabel}>营养来源</Text>
          <Text style={styles.sourceValue}>{SOURCE_LABELS[item.source]}</Text>
        </View>
        {typeof item.confidence === 'number' ? (
          <View style={styles.confidenceBlock}>
            <Text style={styles.confidenceValue}>{Math.round(item.confidence * 100)}%</Text>
            <Text style={styles.confidenceLabel}>置信度</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.header}>
        <TextInput
          value={item.name}
          onChangeText={(name) => onChange({ ...item, name })}
          style={styles.name}
          placeholder="食物名称"
        />
        <Pressable onPress={onRemove} hitSlop={10}>
          <View style={styles.trashButton}>
            <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
          </View>
        </Pressable>
      </View>

      <View style={styles.meta}>
        {item.cookingMethod ? (
          <View style={styles.cookingTag}>
            <Ionicons name="flame-outline" size={13} color={theme.colors.textMuted} />
            <Text style={styles.cookingText}>{item.cookingMethod}</Text>
          </View>
        ) : null}
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
          highlight
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
  highlight = false,
}: {
  label: string;
  value: number;
  onChange: (value: string) => void;
  highlight?: boolean;
}) {
  return (
    <View style={styles.numberField}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={String(value)}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        style={[styles.input, highlight && styles.inputHighlight]}
        selectTextOnFocus
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 0,
    overflow: 'hidden',
    gap: 0,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    backgroundColor: theme.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  sourceMark: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceMarkAi: {
    backgroundColor: theme.colors.accent,
  },
  sourceMarkManual: {
    backgroundColor: theme.colors.ink,
  },
  sourceMarkText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  sourceCopy: {
    flex: 1,
  },
  sourceLabel: {
    color: theme.colors.textFaint,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  sourceValue: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
    marginTop: 2,
  },
  confidenceBlock: {
    alignItems: 'flex-end',
  },
  confidenceValue: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  confidenceLabel: {
    color: theme.colors.textFaint,
    fontSize: 8,
    fontWeight: '800',
    marginTop: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  name: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 19,
    fontWeight: '900',
    paddingVertical: 7,
  },
  trashButton: {
    width: 36,
    height: 36,
    borderRadius: 9,
    backgroundColor: theme.colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  cookingTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: theme.colors.background,
    borderRadius: 7,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  cookingText: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  warning: {
    color: theme.colors.warning,
    backgroundColor: theme.colors.warningSoft,
    borderRadius: 0,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 12,
    lineHeight: 18,
  },
  fields: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    padding: 16,
    paddingTop: 14,
  },
  numberField: {
    width: '30%',
    minWidth: 92,
    flexGrow: 1,
    gap: 4,
  },
  fieldLabel: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
  },
  input: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    color: theme.colors.text,
    backgroundColor: theme.colors.background,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  inputHighlight: {
    borderColor: '#AEBBFF',
    backgroundColor: theme.colors.primarySoft,
    color: theme.colors.primaryDark,
  },
});
