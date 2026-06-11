import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { MealItemEditor } from '@/components/MealItemEditor';
import { HeaderIconButton } from '@/components/ui/AppHeader';
import { Card } from '@/components/ui/Card';
import { ChoiceChips } from '@/components/ui/ChoiceChips';
import { FormField } from '@/components/ui/FormField';
import { MealDateTimePicker } from '@/components/ui/MealDateTimePicker';
import { MealTotalSummary } from '@/components/ui/MealTotalSummary';
import { PhotoGallery, type PhotoGalleryItem } from '@/components/ui/PhotoGallery';
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
  const [eatenAt, setEatenAt] = useState<Date | null>(null);
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
      if (nextMeal) {
        setEatenAt(new Date(nextMeal.eatenAt));
      }
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
  const displayPhotos: PhotoGalleryItem[] = (meal.photoUris?.length
    ? meal.photoUris
    : meal.photoUri
      ? [meal.photoUri]
      : []
  )
    .map((uri) => ({ uri: resolveStoredPhotoUri(uri) }))
    .filter((photo): photo is PhotoGalleryItem => Boolean(photo.uri));
  const handleSave = async () => {
    if (items.length === 0) {
      showAlert('至少保留一种食物，或删除整餐记录。');
      return;
    }
    if (!eatenAt) {
      showAlert('请检查吃饭时间');
      return;
    }
    setSaving(true);
    try {
      const nextNotes = notes.trim() || undefined;
      await updateMeal(db, meal.id, {
        eatenAt: eatenAt.toISOString(),
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
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={styles.headerActions}>
              <HeaderIconButton
                accessibilityLabel="删除整餐"
                icon="trash-outline"
                onPress={confirmDelete}
                variant="danger"
              />
              <HeaderIconButton
                accessibilityLabel="保存修改"
                icon="checkmark"
                loading={saving}
                onPress={handleSave}
                variant="primary"
              />
            </View>
          ),
        }}
      />
      <Screen topSafe={false} stickyHeaderKeys={['meal-total-summary']}>
        <View style={styles.header}>
          <View style={styles.titleIcon}>
            <Text style={styles.titleIconText}>{items.length}</Text>
          </View>
          <Text style={styles.title}>编辑记录</Text>
        </View>
        <View key="meal-total-summary" style={styles.stickyTotalWrap}>
          <MealTotalSummary totals={totals} />
        </View>
        <Card variant="prominent" style={styles.metaCard}>
          <View style={styles.metaTitleRow}>
            <Text style={styles.metaTitle}>本餐信息</Text>
          </View>
          {eatenAt ? <MealDateTimePicker value={eatenAt} onChange={setEatenAt} /> : null}
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
            columns={4}
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
        <PhotoGallery photos={displayPhotos} />
        {items.map((item, index) => (
          <MealItemEditor
            key={item.id}
            item={item}
            onChange={(next) =>
              setItems((current) =>
                current.map((currentItem, currentIndex) =>
                  currentIndex === index ? next : currentItem,
                ),
              )
            }
            onAddToCatalog={addItemToCatalog}
            addingToCatalog={catalogSavingId === item.id}
            onRemove={() =>
              setItems((current) => current.filter((currentItem) => currentItem.id !== item.id))
            }
          />
        ))}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
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
  metaCard: {
    gap: 13,
    borderColor: '#FFFFFF',
  },
  metaTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  notesInput: {
    minHeight: 78,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  titleInput: {
    fontWeight: '900',
  },
  stickyTotalWrap: {
    backgroundColor: 'transparent',
    paddingVertical: 8,
    zIndex: 4,
  },
});
