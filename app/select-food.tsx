import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { Card } from '@/components/ui/Card';
import { ChoiceChips } from '@/components/ui/ChoiceChips';
import { FormField } from '@/components/ui/FormField';
import { Screen } from '@/components/ui/Screen';
import { theme } from '@/constants/Theme';
import { useApp } from '@/context/AppContext';
import { FOOD_CATEGORY_LABELS, FOOD_CATEGORY_OPTIONS } from '@/data/foodCategories';
import {
  countManagedFoods,
  getManagedFoods,
  type ManagedFood,
} from '@/lib/database';
import { scaleNutrition } from '@/lib/nutrition';
import { createLocalId } from '@/lib/security';
import type { FoodCategory } from '@/types/domain';

type CategoryFilter = FoodCategory | 'all';

const PAGE_SIZE = 30;

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

export default function SelectFoodScreen() {
  const db = useSQLiteContext();
  const { queueMealItem } = useApp();
  const scrollRef = useRef<ScrollView>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [foods, setFoods] = useState<ManagedFood[]>([]);
  const [resultCount, setResultCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setPage(0);
  }, [query, category]);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      Promise.all([
        getManagedFoods(db, {
          query,
          category,
          scope: 'all',
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        }),
        countManagedFoods(db, { query, category, scope: 'all' }),
      ])
        .then(([nextFoods, nextCount]) => {
          if (!active) return;
          setFoods(nextFoods);
          setResultCount(nextCount);
        })
        .catch(() => {
          if (!active) return;
          setFoods([]);
          setResultCount(0);
        })
        .finally(() => {
          if (!active) return;
          setLoading(false);
        });
    }, 160);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [db, query, category, page]);

  const categoryOptions = useMemo(
    () => [
      { label: '全部', value: 'all' as const, icon: 'apps-outline' as const },
      ...FOOD_CATEGORY_OPTIONS.map((item) => ({
        ...item,
        icon: CATEGORY_ICONS[item.value],
      })),
    ],
    [],
  );

  const totalPages = Math.max(1, Math.ceil(resultCount / PAGE_SIZE));
  const canGoPrevious = page > 0;
  const canGoNext = page + 1 < totalPages;
  const scrollToTop = () => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    });
  };

  const goToPage = (nextPage: number) => {
    setPage(nextPage);
    scrollToTop();
  };

  const addFood = (food: ManagedFood) => {
    queueMealItem({
      id: createLocalId('food'),
      name: food.nameZh,
      weightGrams: 100,
      ...scaleNutrition(food, 100),
      source: 'catalog',
      catalogFoodId: food.id,
    });
    router.back();
  };

  return (
    <Screen topSafe={false} scrollRef={scrollRef} contentContainerStyle={styles.screen}>
      <Card variant="prominent" style={styles.searchCard}>
        <FormField
          label="搜索食物"
          value={query}
          onChangeText={setQuery}
          placeholder="鸡胸肉、米饭、酸奶…"
          autoFocus
        />
        <ChoiceChips
          value={category}
          onChange={setCategory}
          options={categoryOptions}
          adaptive
          columns={3}
        />
      </Card>

      <View style={styles.listHeader}>
        <View>
          <Text style={styles.listTitle}>选择食物</Text>
          <Text style={styles.pageMeta}>
            第 {page + 1} / {totalPages} 页 · 共 {resultCount} 条
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push({
              pathname: '/edit-food',
              params: { returnTo: 'select-food', name: query.trim() },
            })
          }
          style={({ pressed }) => [styles.createButton, pressed && styles.pressed]}
        >
          <Ionicons name="add" size={18} color={theme.colors.primary} />
          <Text style={styles.createText}>创建</Text>
        </Pressable>
      </View>

      <Card variant="base" style={styles.resultCard}>
        {foods.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name={loading ? 'hourglass-outline' : 'search-outline'} size={24} color={theme.colors.textMuted} />
            <Text style={styles.emptyText}>{loading ? '正在读取食物库…' : '没有找到匹配的食物。'}</Text>
          </View>
        ) : (
          foods.map((food) => (
            <Pressable
              key={food.id}
              accessibilityRole="button"
              onPress={() => addFood(food)}
              style={({ pressed }) => [styles.foodRow, pressed && styles.pressed]}
            >
              <View style={styles.foodCopy}>
                <View style={styles.foodNameRow}>
                  <Text style={styles.foodName}>{food.nameZh}</Text>
                  {food.isCustom ? (
                    <View style={styles.customPill}>
                      <Text style={styles.customPillText}>我的</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.foodMeta}>
                  {formatFoodMeta(food)} · 100g · {Math.round(food.calories)} kcal
                </Text>
              </View>
              <Ionicons name="add" size={24} color={theme.colors.primary} />
            </Pressable>
          ))
        )}
      </Card>

      <View style={styles.pagination}>
        <AppButton
          label="上一页"
          icon="chevron-back"
          variant="secondary"
          disabled={!canGoPrevious}
          onPress={() => goToPage(Math.max(0, page - 1))}
          style={styles.pageButton}
        />
        <AppButton
          label="下一页"
          icon="chevron-forward"
          variant="secondary"
          disabled={!canGoNext}
          onPress={() => goToPage(page + 1)}
          style={styles.pageButton}
        />
      </View>
    </Screen>
  );
}

function formatFoodMeta(food: ManagedFood): string {
  return [FOOD_CATEGORY_LABELS[food.category], food.cookingMethod].filter(Boolean).join(' · ');
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: 14,
  },
  searchCard: {
    gap: 12,
    borderColor: '#FFFFFF',
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  listTitle: {
    color: theme.colors.text,
    fontSize: 21,
    fontWeight: '900',
  },
  pageMeta: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  createButton: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.primarySoft,
    paddingHorizontal: 13,
    boxShadow: theme.shadows.small,
  },
  createText: {
    color: theme.colors.primary,
    fontSize: 13,
    fontWeight: '900',
  },
  resultCard: {
    paddingVertical: 4,
    gap: 0,
    overflow: 'hidden',
  },
  foodRow: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderSoft,
  },
  foodCopy: {
    flex: 1,
    minWidth: 0,
  },
  foodNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  foodName: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  foodMeta: {
    color: theme.colors.textMuted,
    fontSize: 13,
    marginTop: 4,
  },
  customPill: {
    borderRadius: 7,
    backgroundColor: theme.colors.successSoft,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  customPillText: {
    color: theme.colors.success,
    fontSize: 9,
    fontWeight: '900',
  },
  empty: {
    minHeight: 96,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.surfaceInset,
  },
  emptyText: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: '800',
  },
  pagination: {
    flexDirection: 'row',
    gap: 10,
  },
  pageButton: {
    flex: 1,
  },
  pressed: {
    opacity: 0.72,
  },
});
