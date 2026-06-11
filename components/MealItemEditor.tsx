import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { theme } from '@/constants/Theme';
import { applyRecognitionChoice } from '@/lib/mealItemDrafts';
import type {
  MealItemDraft,
  MealItemRecognitionChoice,
  MealItemRecognitionOption,
  NutritionSource,
} from '@/types/domain';

const SOURCE_LABELS: Record<NutritionSource, string> = {
  catalog: '食物库',
  ai: 'AI 估算',
  manual: '手动',
};

interface Props {
  item: MealItemDraft;
  onChange: (item: MealItemDraft) => void;
  onRemove: () => void;
  onAddToCatalog?: (item: MealItemDraft) => void;
  addingToCatalog?: boolean;
}

export function MealItemEditor({
  item,
  onChange,
  onRemove,
  onAddToCatalog,
  addingToCatalog = false,
}: Props) {
  const setNumber = (
    key: 'weightGrams' | 'calories' | 'protein' | 'carbs' | 'fat',
    value: string,
  ) => {
    const parsed = Number(value);
    onChange({ ...item, [key]: Number.isFinite(parsed) ? Math.max(0, parsed) : 0 });
  };

  return (
    <Card variant="base" style={styles.card}>
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
        <Text style={styles.sourceValue}>{SOURCE_LABELS[item.source]}</Text>
        {item.cookingMethod ? (
          <View style={styles.cookingTag}>
            <Ionicons name="flame-outline" size={13} color={theme.colors.textMuted} />
            <Text style={styles.cookingText}>{item.cookingMethod}</Text>
          </View>
        ) : null}
        {typeof item.confidence === 'number' ? (
          <Text style={styles.confidenceValue}>{Math.round(item.confidence * 100)}%</Text>
        ) : null}
      </View>

      {item.recognitionAlternatives ? (
        <View style={styles.choicePanel}>
          <Text style={styles.choiceTitle}>选择本条食物数据来源</Text>
          <View style={styles.choiceButtons}>
            <RecognitionChoiceButton
              label="AI 结果"
              option={item.recognitionAlternatives.ai}
              selected={item.recognitionAlternatives.selected === 'ai'}
              onPress={() => onChange(applyRecognitionChoice(item, 'ai'))}
            />
            <RecognitionChoiceButton
              label="食物库"
              option={item.recognitionAlternatives.catalog}
              selected={item.recognitionAlternatives.selected === 'catalog'}
              onPress={() => onChange(applyRecognitionChoice(item, 'catalog'))}
            />
          </View>
        </View>
      ) : null}

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

      {item.warning ? <Text style={styles.warning}>{item.warning}</Text> : null}

      {item.source === 'ai' && onAddToCatalog ? (
        <Pressable
          accessibilityRole="button"
          disabled={addingToCatalog || !item.name.trim()}
          onPress={() => onAddToCatalog(item)}
          style={({ pressed }) => [
            styles.catalogAction,
            addingToCatalog && styles.catalogActionDisabled,
            pressed && styles.pressed,
          ]}
        >
          {addingToCatalog ? (
            <ActivityIndicator color={theme.colors.primary} />
          ) : (
            <Ionicons name="library-outline" size={17} color={theme.colors.primary} />
          )}
          <Text style={styles.catalogActionText}>
            {addingToCatalog ? '正在加入' : '加入食物库'}
          </Text>
        </Pressable>
      ) : null}

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

function RecognitionChoiceButton({
  label,
  option,
  selected,
  onPress,
}: {
  label: string;
  option: MealItemRecognitionOption;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.choiceButton,
        selected && styles.choiceButtonSelected,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.choiceLabel, selected && styles.choiceLabelSelected]}>{label}</Text>
      <Text numberOfLines={1} style={[styles.choiceName, selected && styles.choiceNameSelected]}>
        {option.name}
      </Text>
      <Text style={[styles.choiceMeta, selected && styles.choiceMetaSelected]}>
        {Math.round(option.calories)} kcal
      </Text>
    </Pressable>
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
    backgroundColor: theme.colors.surfaceInset,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSoft,
  },
  sourceMark: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: theme.shadows.small,
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
  sourceValue: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  confidenceValue: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '900',
  },
  choicePanel: {
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: theme.colors.surfaceTint,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSoft,
  },
  choiceTitle: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '900',
  },
  choiceButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  choiceButton: {
    flex: 1,
    minHeight: 82,
    justifyContent: 'space-between',
    gap: 3,
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: theme.colors.surfaceRaised,
    padding: 10,
  },
  choiceButtonSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySoft,
  },
  choiceLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '900',
  },
  choiceLabelSelected: {
    color: theme.colors.primary,
  },
  choiceName: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  choiceNameSelected: {
    color: theme.colors.primaryDark,
  },
  choiceMeta: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  choiceMetaSelected: {
    color: theme.colors.primary,
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
    borderCurve: 'continuous',
    backgroundColor: theme.colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cookingTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: theme.colors.surfaceRaised,
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
  catalogAction: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSoft,
    backgroundColor: theme.colors.primarySoft,
  },
  catalogActionDisabled: {
    opacity: 0.55,
  },
  catalogActionText: {
    color: theme.colors.primary,
    fontSize: 13,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.72,
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
    borderColor: theme.colors.borderSoft,
    borderRadius: 8,
    borderCurve: 'continuous',
    paddingHorizontal: 10,
    color: theme.colors.text,
    backgroundColor: theme.colors.surfaceInset,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  inputHighlight: {
    borderColor: '#AEBBFF',
    backgroundColor: theme.colors.primarySoft,
    color: theme.colors.primaryDark,
  },
});
