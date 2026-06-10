import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';

import { MealItemEditor } from '@/components/MealItemEditor';
import { AppButton } from '@/components/ui/AppButton';
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
      <View style={styles.header}>
        <Text style={styles.kicker}>EDIT / MEAL</Text>
        <Text style={styles.title}>修正这餐数据</Text>
        <Text style={styles.subtitle}>修改后会立即更新今日和历史统计。</Text>
      </View>
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
      <View style={styles.total}>
        <View>
          <Text style={styles.totalLabel}>UPDATED TOTAL</Text>
          <Text style={styles.totalMeta}>
            P {Math.round(totals.protein)}g · C {Math.round(totals.carbs)}g · F{' '}
            {Math.round(totals.fat)}g
          </Text>
        </View>
        <View style={styles.totalRight}>
          <Text style={styles.totalValue}>{Math.round(totals.calories)}</Text>
          <Text style={styles.totalUnit}>KCAL</Text>
        </View>
      </View>
      <AppButton label="保存修改" icon="checkmark" onPress={handleSave} loading={saving} />
      <AppButton label="删除整餐" variant="danger" onPress={confirmDelete} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: 5,
    marginTop: 4,
  },
  kicker: {
    color: theme.colors.primary,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  title: {
    color: theme.colors.text,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  subtitle: {
    color: theme.colors.textMuted,
    fontSize: 13,
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
  },
  total: {
    backgroundColor: theme.colors.ink,
    borderRadius: theme.radius.medium,
    paddingHorizontal: 18,
    paddingVertical: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  totalLabel: {
    color: '#AEB9CD',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.1,
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
    marginTop: 6,
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
