import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Image, StyleSheet, Text } from 'react-native';

import { MealItemEditor } from '@/components/MealItemEditor';
import { AppButton } from '@/components/ui/AppButton';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { theme } from '@/constants/Theme';
import { deleteMeal, getMealById, updateMealItems } from '@/lib/database';
import { sumMacros } from '@/lib/nutrition';
import type { MealItemDraft, MealRecord } from '@/types/domain';

export default function EditMealScreen() {
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id: string }>();
  const mealId = Number(id);
  const [meal, setMeal] = useState<MealRecord | null>(null);
  const [items, setItems] = useState<MealItemDraft[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(mealId)) {
      return;
    }
    getMealById(db, mealId).then((nextMeal) => {
      setMeal(nextMeal);
      setItems(nextMeal?.items ?? []);
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
  const handleSave = async () => {
    if (items.length === 0) {
      Alert.alert('至少保留一种食物，或删除整餐记录。');
      return;
    }
    setSaving(true);
    try {
      await updateMealItems(db, meal.id, items);
      router.back();
    } catch (error) {
      Alert.alert('保存失败', error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert('删除整餐记录？', '此操作无法撤销。', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          await deleteMeal(db, meal.id);
          router.back();
        },
      },
    ]);
  };

  return (
    <Screen>
      {meal.photoUri ? <Image source={{ uri: meal.photoUri }} style={styles.photo} /> : null}
      {items.map((item, index) => (
        <MealItemEditor
          key={item.id}
          item={item}
          onChange={(next) =>
            setItems((current) =>
              current.map((currentItem, currentIndex) => (currentIndex === index ? next : currentItem)),
            )
          }
          onRemove={() =>
            setItems((current) => current.filter((currentItem) => currentItem.id !== item.id))
          }
        />
      ))}
      <Card style={styles.total}>
        <Text style={styles.totalLabel}>更新后合计</Text>
        <Text style={styles.totalValue}>{Math.round(totals.calories)} kcal</Text>
        <Text style={styles.totalMeta}>
          蛋白质 {Math.round(totals.protein)}g · 碳水 {Math.round(totals.carbs)}g · 脂肪{' '}
          {Math.round(totals.fat)}g
        </Text>
      </Card>
      <AppButton label="保存修改" onPress={handleSave} loading={saving} />
      <AppButton label="删除整餐" variant="danger" onPress={confirmDelete} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: {
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginTop: 40,
  },
  photo: {
    width: '100%',
    height: 210,
    borderRadius: theme.radius.medium,
  },
  total: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  totalLabel: {
    color: '#DDEBDD',
  },
  totalValue: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
  },
  totalMeta: {
    color: '#DDEBDD',
  },
});
