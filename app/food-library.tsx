import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { Card } from '@/components/ui/Card';
import { ChoiceChips } from '@/components/ui/ChoiceChips';
import { FormField } from '@/components/ui/FormField';
import { Screen } from '@/components/ui/Screen';
import { theme } from '@/constants/Theme';
import { FOOD_CATEGORY_LABELS, FOOD_CATEGORY_OPTIONS } from '@/data/foodCategories';
import {
  countManagedFoods,
  getFoodCatalogStats,
  getManagedFoods,
  type FoodCatalogScope,
  type FoodCatalogStats,
  type ManagedFood,
} from '@/lib/database';
import type { FoodCategory } from '@/types/domain';

type CategoryFilter = FoodCategory | 'all';

const PAGE_SIZE = 36;
const EMPTY_STATS: FoodCatalogStats = {
  total: 0,
  builtIn: 0,
  custom: 0,
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

export default function FoodLibraryScreen() {
  const db = useSQLiteContext();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<FoodCatalogScope>('all');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [foods, setFoods] = useState<ManagedFood[]>([]);
  const [stats, setStats] = useState<FoodCatalogStats>(EMPTY_STATS);
  const [resultCount, setResultCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setPage(0);
  }, [query, scope, category]);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      Promise.all([
        getManagedFoods(db, {
          query,
          category,
          scope,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        }),
        countManagedFoods(db, { query, category, scope }),
        getFoodCatalogStats(db),
      ])
        .then(([nextFoods, nextResultCount, nextStats]) => {
          if (!active) return;
          setFoods(nextFoods);
          setResultCount(nextResultCount);
          setStats(nextStats);
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
  }, [db, query, category, scope, page]);

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

  return (
    <Screen topSafe={false} contentContainerStyle={styles.screen}>
      <View style={styles.statsRow}>
        <StatTile label="全部" value={stats.total} />
        <StatTile label="预置" value={stats.builtIn} />
        <StatTile label="我的" value={stats.custom} />
      </View>

      <Card style={styles.searchCard}>
        <View style={styles.searchHeader}>
          <View style={styles.searchField}>
            <FormField
              label="搜索"
              value={query}
              onChangeText={setQuery}
              placeholder="米饭、牛肉面、奶茶、橄榄油…"
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="新增自定义食物"
            onPress={() => router.push('/edit-food')}
            style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
          >
            <Ionicons name="add" size={24} color="#FFFFFF" />
          </Pressable>
        </View>
        <ChoiceChips
          value={scope}
          onChange={setScope}
          options={[
            { label: '全部', value: 'all', icon: 'layers-outline' },
            { label: '预置', value: 'built_in', icon: 'shield-checkmark-outline' },
            { label: '我的', value: 'custom', icon: 'person-outline' },
          ]}
        />
        <ChoiceChips
          value={category}
          onChange={setCategory}
          options={categoryOptions}
          adaptive
        />
      </Card>

      <View style={styles.listHeader}>
        <View>
          <Text style={styles.listTitle}>结果</Text>
          <Text style={styles.pageMeta}>
            第 {page + 1} / {totalPages} 页 · 共 {resultCount} 条
          </Text>
        </View>
        <Text style={styles.listCount}>{foods.length}</Text>
      </View>

      {foods.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name={loading ? 'hourglass-outline' : 'search-outline'} size={24} color={theme.colors.textMuted} />
          <Text style={styles.emptyText}>{loading ? '正在读取食物库…' : '没有找到匹配的食物。'}</Text>
        </View>
      ) : (
        foods.map((food) => <FoodRow key={food.id} food={food} />)
      )}

      <View style={styles.pagination}>
        <AppButton
          label="上一页"
          icon="chevron-back"
          variant="secondary"
          disabled={!canGoPrevious}
          onPress={() => setPage((value) => Math.max(0, value - 1))}
          style={styles.pageButton}
        />
        <AppButton
          label="下一页"
          icon="chevron-forward"
          variant="secondary"
          disabled={!canGoNext}
          onPress={() => setPage((value) => value + 1)}
          style={styles.pageButton}
        />
      </View>
    </Screen>
  );
}

function FoodRow({ food }: { food: ManagedFood }) {
  const handlePress = () => {
    if (food.isCustom) {
      router.push({ pathname: '/edit-food', params: { id: food.id } });
      return;
    }
    router.push({ pathname: '/edit-food', params: { sourceId: food.id } });
  };

  return (
    <Pressable accessibilityRole="button" onPress={handlePress} style={({ pressed }) => pressed && styles.pressed}>
      <Card style={styles.foodCard}>
        <View style={styles.foodTop}>
          <View style={styles.foodNameBlock}>
            <Text style={styles.foodName}>{food.nameZh}</Text>
            <Text style={styles.foodMeta}>
              {formatFoodMeta(food)} · 100g/ml · {Math.round(food.calories)} kcal
            </Text>
          </View>
          <View style={[styles.badge, food.isCustom && styles.badgeCustom]}>
            <Text style={[styles.badgeText, food.isCustom && styles.badgeTextCustom]}>
              {food.isCustom ? '我的' : '预置'}
            </Text>
          </View>
        </View>
        <View style={styles.macroRow}>
          <MacroPill label="蛋白" value={food.protein} color={theme.colors.protein} />
          <MacroPill label="碳水" value={food.carbs} color={theme.colors.carbs} />
          <MacroPill label="脂肪" value={food.fat} color={theme.colors.fat} />
        </View>
        <View style={styles.sourceRow}>
          <Ionicons name="document-text-outline" size={15} color={theme.colors.textMuted} />
          <Text selectable numberOfLines={2} style={styles.sourceText}>
            {food.sourceReference}
          </Text>
          <Ionicons
            name={food.isCustom ? 'create-outline' : 'copy-outline'}
            size={18}
            color={theme.colors.primary}
          />
        </View>
      </Card>
    </Pressable>
  );
}

function formatFoodMeta(food: ManagedFood): string {
  return [FOOD_CATEGORY_LABELS[food.category], food.cookingMethod].filter(Boolean).join(' · ');
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function MacroPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.macroPill}>
      <View style={[styles.macroDot, { backgroundColor: color }]} />
      <Text style={styles.macroLabel}>{label}</Text>
      <Text style={styles.macroValue}>{Math.round(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: 14,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statTile: {
    flex: 1,
    minHeight: 76,
    borderRadius: 16,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  statValue: {
    color: theme.colors.text,
    fontSize: 23,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
  },
  searchCard: {
    gap: 12,
  },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  searchField: {
    flex: 1,
    minWidth: 0,
  },
  addButton: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 5,
  },
  listTitle: {
    color: theme.colors.text,
    fontSize: 19,
    fontWeight: '900',
  },
  pageMeta: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  listCount: {
    minWidth: 32,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceMuted,
    color: theme.colors.textMuted,
    textAlign: 'center',
    lineHeight: 28,
    fontSize: 11,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  empty: {
    minHeight: 96,
    borderRadius: 18,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyText: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: '800',
  },
  foodCard: {
    gap: 12,
  },
  foodTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  foodNameBlock: {
    flex: 1,
    minWidth: 0,
  },
  foodName: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  foodMeta: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  badge: {
    borderRadius: 8,
    backgroundColor: theme.colors.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  badgeCustom: {
    backgroundColor: theme.colors.successSoft,
  },
  badgeText: {
    color: theme.colors.primary,
    fontSize: 10,
    fontWeight: '900',
  },
  badgeTextCustom: {
    color: theme.colors.success,
  },
  macroRow: {
    flexDirection: 'row',
    gap: 7,
  },
  macroPill: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 11,
    backgroundColor: theme.colors.background,
    paddingVertical: 8,
    paddingHorizontal: 7,
  },
  macroDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  macroLabel: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
  },
  macroValue: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  sourceText: {
    flex: 1,
    color: theme.colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
  },
  pagination: {
    flexDirection: 'row',
    gap: 10,
  },
  pageButton: {
    flex: 1,
  },
});
