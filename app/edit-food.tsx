import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { Card } from '@/components/ui/Card';
import { ChoiceChips } from '@/components/ui/ChoiceChips';
import { FormField } from '@/components/ui/FormField';
import { Screen } from '@/components/ui/Screen';
import { theme } from '@/constants/Theme';
import { FOOD_CATEGORY_OPTIONS } from '@/data/foodCategories';
import { showAlert } from '@/lib/alert';
import {
  deleteCustomFood,
  getManagedFoodById,
  saveCustomFood,
  type FoodCatalogInput,
  type ManagedFood,
} from '@/lib/database';
import type { FoodCategory } from '@/types/domain';

type Draft = FoodCatalogInput & {
  aliasesText: string;
};

const CATEGORY_ICONS: Record<FoodCategory, keyof typeof Ionicons.glyphMap> = {
  staple: 'nutrition-outline',
  protein: 'fish-outline',
  vegetable: 'leaf-outline',
  fruit: 'rose-outline',
  dairy: 'cafe-outline',
  snack: 'ice-cream-outline',
  dish: 'restaurant-outline',
  beverage: 'wine-outline',
  condiment: 'flask-outline',
};

function createEmptyDraft(name?: string): Draft {
  return {
    nameZh: name ?? '',
    nameEn: '',
    category: 'dish',
    aliasesText: '',
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    sourceReference: '用户自定义；请按包装营养标签、品牌官网或可信食物成分表维护',
  };
}

function draftFromFood(food: ManagedFood, copy = false): Draft {
  const aliasesText = food.aliases
    .filter((alias) => alias !== food.nameZh && alias !== food.nameEn)
    .join('、');
  return {
    id: copy ? undefined : food.id,
    nameZh: copy ? `${food.nameZh}（我的）` : food.nameZh,
    nameEn: food.nameEn ?? '',
    category: food.category,
    aliasesText,
    calories: food.calories,
    protein: food.protein,
    carbs: food.carbs,
    fat: food.fat,
    sourceReference: copy ? `${food.sourceReference}；用户复制后维护` : food.sourceReference,
  };
}

export default function EditFoodScreen() {
  const db = useSQLiteContext();
  const { id, sourceId, name, returnTo } = useLocalSearchParams<{
    id?: string;
    sourceId?: string;
    name?: string;
    returnTo?: string;
  }>();
  const [draft, setDraft] = useState<Draft>(() => createEmptyDraft(name));
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(Boolean(id || sourceId));

  useEffect(() => {
    const foodId = id ?? sourceId;
    if (!foodId) {
      setDraft(createEmptyDraft(name));
      setLoading(false);
      return;
    }
    setLoading(true);
    getManagedFoodById(db, foodId)
      .then((food) => {
        if (food) {
          setDraft(draftFromFood(food, Boolean(sourceId)));
        }
      })
      .finally(() => setLoading(false));
  }, [db, id, name, sourceId]);

  const updateDraft = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const updateNumber = (key: 'calories' | 'protein' | 'carbs' | 'fat', value: string) => {
    const parsed = Number(value);
    updateDraft(key, Number.isFinite(parsed) ? Math.max(0, parsed) : 0);
  };

  const handleSave = async () => {
    if (!draft.nameZh.trim()) {
      showAlert('请填写食物名称');
      return;
    }
    setSaving(true);
    try {
      await saveCustomFood(db, {
        id: draft.id,
        nameZh: draft.nameZh.trim(),
        nameEn: draft.nameEn?.trim() || undefined,
        category: draft.category,
        calories: draft.calories,
        protein: draft.protein,
        carbs: draft.carbs,
        fat: draft.fat,
        aliases: splitAliases(draft.aliasesText),
        sourceReference: draft.sourceReference?.trim() || undefined,
      });
      if (returnTo === 'select-food') {
        router.replace('/select-food');
      } else {
        router.back();
      }
    } catch (error) {
      showAlert('保存失败', error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () => {
    if (!draft.id) return;
    showAlert('删除这个自定义食物？', '已保存的历史餐食不会被删除。', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteCustomFood(db, draft.id!);
            router.back();
          } catch (error) {
            showAlert('删除失败', error instanceof Error ? error.message : String(error));
          }
        },
      },
    ]);
  };

  return (
    <Screen topSafe={false} contentContainerStyle={styles.screen}>
      <Card style={styles.formCard}>
        <View style={styles.formTitleRow}>
          <View style={styles.titleMark}>
            <Ionicons name={draft.id ? 'create-outline' : 'add'} size={22} color={theme.colors.primary} />
          </View>
          <View style={styles.titleCopy}>
            <Text style={styles.formTitle}>
              {loading ? '读取食物…' : draft.id ? '编辑我的食物' : sourceId ? '复制为我的食物' : '新增自定义食物'}
            </Text>
            <Text style={styles.formSubtitle}>营养值按每 100g/ml 维护</Text>
          </View>
        </View>

        <FormField
          label="名称"
          value={draft.nameZh}
          onChangeText={(value) => updateDraft('nameZh', value)}
          placeholder="例如：公司食堂鸡腿饭"
        />
        <FormField
          label="英文名 / 品牌（可选）"
          value={draft.nameEn}
          onChangeText={(value) => updateDraft('nameEn', value)}
          placeholder="用于搜索和备注"
        />
        <View style={styles.formGroup}>
          <Text style={styles.groupLabel}>分类</Text>
          <ChoiceChips
            value={draft.category}
            onChange={(value) => updateDraft('category', value)}
            options={FOOD_CATEGORY_OPTIONS.map((item) => ({
              ...item,
              icon: CATEGORY_ICONS[item.value],
            }))}
          />
        </View>
        <FormField
          label="别名"
          value={draft.aliasesText}
          onChangeText={(value) => updateDraft('aliasesText', value)}
          placeholder="用顿号或逗号分隔，例如：鸡腿盖饭、鸡肉饭"
        />
        <View style={styles.nutritionGrid}>
          <NumberField
            label="热量 kcal"
            value={draft.calories}
            onChange={(value) => updateNumber('calories', value)}
          />
          <NumberField
            label="蛋白质 g"
            value={draft.protein}
            onChange={(value) => updateNumber('protein', value)}
          />
          <NumberField
            label="碳水 g"
            value={draft.carbs}
            onChange={(value) => updateNumber('carbs', value)}
          />
          <NumberField
            label="脂肪 g"
            value={draft.fat}
            onChange={(value) => updateNumber('fat', value)}
          />
        </View>
        <FormField
          label="来源"
          value={draft.sourceReference}
          onChangeText={(value) => updateDraft('sourceReference', value)}
          placeholder="包装营养标签、品牌官网、食物成分表等"
          multiline
        />
        <View style={styles.formActions}>
          {draft.id ? (
            <Pressable accessibilityRole="button" onPress={confirmDelete} style={styles.deleteButton}>
              <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
              <Text style={styles.deleteText}>删除</Text>
            </Pressable>
          ) : null}
          <View style={styles.formSave}>
            <AppButton label="保存食物" icon="checkmark" onPress={handleSave} loading={saving} />
          </View>
        </View>
      </Card>
    </Screen>
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
      <FormField
        label={label}
        value={String(value)}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        selectTextOnFocus
      />
    </View>
  );
}

function splitAliases(value: string): string[] {
  return value
    .split(/[、,，\n]/)
    .map((alias) => alias.trim())
    .filter(Boolean);
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: 14,
  },
  formCard: {
    gap: 14,
    borderColor: theme.colors.primary,
  },
  formTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  titleMark: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleCopy: {
    flex: 1,
  },
  formTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  formSubtitle: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  formGroup: {
    gap: 7,
  },
  groupLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  nutritionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  numberField: {
    width: '47%',
    flexGrow: 1,
  },
  formActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  deleteButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: theme.colors.accentSoft,
  },
  deleteText: {
    color: theme.colors.danger,
    fontSize: 13,
    fontWeight: '900',
  },
  formSave: {
    flex: 1,
  },
});
