import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { MealItemEditor } from '@/components/MealItemEditor';
import { AppButton } from '@/components/ui/AppButton';
import { Card } from '@/components/ui/Card';
import { ChoiceChips } from '@/components/ui/ChoiceChips';
import { FormField } from '@/components/ui/FormField';
import { Screen } from '@/components/ui/Screen';
import { theme } from '@/constants/Theme';
import { showAlert } from '@/lib/alert';
import { deleteMeal, getMealById, saveCustomFood, updateMeal } from '@/lib/database';
import { resolveStoredPhotoUri } from '@/lib/image';
import { createCustomFoodInputFromMealItem } from '@/lib/mealItemDrafts';
import { createMealTitle, resolveMealTitle } from '@/lib/mealTitle';
import { sumMacros } from '@/lib/nutrition';
import { syncTodayNutritionWidget } from '@/lib/widgetSync';
import type { MealItemDraft, MealRecord, MealType } from '@/types/domain';

const MEAL_TYPE_OPTIONS: Array<{
  label: string;
  value: MealType;
  icon: 'sunny-outline' | 'restaurant-outline' | 'moon-outline' | 'cafe-outline';
}> = [
  { label: '早餐', value: 'breakfast', icon: 'sunny-outline' },
  { label: '午餐', value: 'lunch', icon: 'restaurant-outline' },
  { label: '晚餐', value: 'dinner', icon: 'moon-outline' },
  { label: '加餐', value: 'snack', icon: 'cafe-outline' },
];

export default function EditMealScreen() {
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id: string }>();
  const mealId = Number(id);
  const [meal, setMeal] = useState<MealRecord | null>(null);
  const [items, setItems] = useState<MealItemDraft[]>([]);
  const [mealType, setMealType] = useState<MealType>('lunch');
  const [mealTitle, setMealTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [catalogSavingId, setCatalogSavingId] = useState<string>();

  useEffect(() => {
    if (!Number.isFinite(mealId)) {
      return;
    }
    getMealById(db, mealId).then((nextMeal) => {
      setMeal(nextMeal);
      setItems(nextMeal?.items ?? []);
      setMealType(nextMeal?.mealType ?? 'lunch');
      setMealTitle(nextMeal?.title ?? createMealTitle(nextMeal?.items ?? []) ?? '');
      setNotes(nextMeal?.notes ?? '');
    });
  }, [db, mealId]);

  if (!meal) {
    return (
      <Screen>
        <Text style={styles.loading}>正在读取记录…</Text>
      </Screen>
    );
  }

  const totals = sumMacros(items);
  const displayPhotoUri = resolveStoredPhotoUri(meal.photoUri);
  const handleSave = async () => {
    if (items.length === 0) {
      showAlert('至少保留一种食物，或删除整餐记录。');
      return;
    }
    setSaving(true);
    try {
      const nextNotes = notes.trim() || undefined;
      await updateMeal(db, meal.id, {
        eatenAt: meal.eatenAt,
        mealType,
        title: resolveMealTitle(mealTitle, items),
        notes: nextNotes,
        items,
      });
      await syncTodayNutritionWidget(db);
      router.back();
    } catch (error) {
      showAlert('保存失败', error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () => {
    showAlert('删除整餐记录？', '此操作无法撤销。', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          await deleteMeal(db, meal.id);
          await syncTodayNutritionWidget(db);
          router.back();
        },
      },
    ]);
  };

  const addItemToCatalog = async (item: MealItemDraft) => {
    if (!item.name.trim()) {
      showAlert('请先填写食物名称');
      return;
    }
    setCatalogSavingId(item.id);
    try {
      const catalogFoodId = await saveCustomFood(db, createCustomFoodInputFromMealItem(item));
      setItems((current) =>
        current.map((currentItem) =>
          currentItem.id === item.id
            ? {
                ...currentItem,
                source: 'catalog',
                catalogFoodId,
                recognitionAlternatives: undefined,
              }
            : currentItem,
        ),
      );
      showAlert('已加入食物库', '已保存为自定义食物，可在食物库继续编辑分类、别名和来源。');
    } catch (error) {
      showAlert('加入失败', error instanceof Error ? error.message : String(error));
    } finally {
      setCatalogSavingId(undefined);
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.titleIcon}>
          <Text style={styles.titleIconText}>{items.length}</Text>
        </View>
        <Text style={styles.title}>编辑记录</Text>
      </View>
      <Card variant="prominent" style={styles.metaCard}>
        <View style={styles.metaTitleRow}>
          <Text style={styles.metaTitle}>本餐信息</Text>
          <Text style={styles.timeText}>
            {new Date(meal.eatenAt).toLocaleString('zh-CN', {
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>
        <FormField
          label="标题"
          value={mealTitle}
          onChangeText={setMealTitle}
          placeholder="例如：鸡腿饭配青菜"
          style={styles.titleInput}
        />
        <ChoiceChips
          value={mealType}
          onChange={setMealType}
          options={MEAL_TYPE_OPTIONS}
          adaptive
        />
        <FormField
          label="备注"
          value={notes}
          onChangeText={setNotes}
          placeholder="口味、场景或份量修正…"
          multiline
          style={styles.notesInput}
        />
      </Card>
      {displayPhotoUri ? <Image source={{ uri: displayPhotoUri }} style={styles.photo} /> : null}
      {items.map((item, index) => (
        <MealItemEditor
          key={item.id}
          item={item}
          onChange={(next) =>
            setItems((current) =>
              current.map((currentItem, currentIndex) => (currentIndex === index ? next : currentItem)),
            )
          }
          onAddToCatalog={addItemToCatalog}
          addingToCatalog={catalogSavingId === item.id}
          onRemove={() =>
            setItems((current) => current.filter((currentItem) => currentItem.id !== item.id))
          }
        />
      ))}
      <View style={styles.total}>
        <View style={styles.totalMacros}>
          <View style={[styles.totalDot, { backgroundColor: theme.colors.protein }]} />
          <Text style={styles.totalMeta}>{Math.round(totals.protein)}</Text>
          <View style={[styles.totalDot, { backgroundColor: theme.colors.carbs }]} />
          <Text style={styles.totalMeta}>{Math.round(totals.carbs)}</Text>
          <View style={[styles.totalDot, { backgroundColor: theme.colors.fat }]} />
          <Text style={styles.totalMeta}>{Math.round(totals.fat)}</Text>
        </View>
        <View style={styles.totalRight}>
          <Text style={styles.totalValue}>{Math.round(totals.calories)}</Text>
          <Text style={styles.totalUnit}>kcal</Text>
        </View>
      </View>
      <AppButton label="保存修改" icon="checkmark" onPress={handleSave} loading={saving} />
      <AppButton label="删除整餐" variant="danger" onPress={confirmDelete} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  titleIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.surfaceTint,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleIconText: {
    color: theme.colors.primary,
    fontSize: 15,
    fontWeight: '900',
  },
  title: {
    color: theme.colors.text,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  loading: {
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginTop: 40,
  },
  photo: {
    width: '100%',
    height: 250,
    borderRadius: theme.radius.large,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: '#FFFFFF',
    boxShadow: theme.shadows.medium,
  },
  metaCard: {
    gap: 13,
    borderColor: '#FFFFFF',
  },
  metaTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  metaTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  timeText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  notesInput: {
    minHeight: 78,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  titleInput: {
    fontWeight: '900',
  },
  total: {
    backgroundColor: theme.colors.ink,
    borderRadius: theme.radius.medium,
    borderCurve: 'continuous',
    paddingHorizontal: 18,
    paddingVertical: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    boxShadow: theme.shadows.large,
  },
  totalValue: {
    color: '#FFFFFF',
    fontSize: 34,
    lineHeight: 36,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  totalMeta: {
    color: '#D0D5DD',
    fontSize: 12,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  totalMacros: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  totalDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  totalRight: {
    alignItems: 'flex-end',
  },
  totalUnit: {
    color: theme.colors.accent,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
});
