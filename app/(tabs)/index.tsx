import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Screen } from '@/components/ui/Screen';
import { theme } from '@/constants/Theme';
import { useApp } from '@/context/AppContext';
import { formatChineseDate, toLocalDateKey } from '@/lib/date';
import { getDayTotals, getMealsForDate, type DaySummary } from '@/lib/database';
import type { MealRecord, MealType } from '@/types/domain';

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  snack: '加餐',
};

export default function TodayScreen() {
  const db = useSQLiteContext();
  const { loading, profile, targets } = useApp();
  const dateKey = toLocalDateKey();
  const [meals, setMeals] = useState<MealRecord[]>([]);
  const [totals, setTotals] = useState<DaySummary | null>(null);
  const [refreshing, setRefreshing] = useState(true);

  const load = useCallback(async () => {
    setRefreshing(true);
    const [nextMeals, nextTotals] = await Promise.all([
      getMealsForDate(db, dateKey),
      getDayTotals(db, dateKey),
    ]);
    setMeals(nextMeals);
    setTotals(nextTotals);
    setRefreshing(false);
  }, [dateKey, db]);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => setRefreshing(false));
    }, [load]),
  );

  if (!loading && !profile) {
    return <Redirect href="/onboarding" />;
  }
  if (loading || !targets || !totals) {
    return (
      <Screen scroll={false} contentContainerStyle={styles.loading}>
        <ActivityIndicator color={theme.colors.primary} size="large" />
      </Screen>
    );
  }

  const remaining = Math.round(targets.calories - totals.calories);
  return (
    <Screen refreshControl={undefined}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>{formatChineseDate(dateKey)}</Text>
          <Text style={styles.title}>今天吃得怎么样？</Text>
        </View>
        {refreshing ? <ActivityIndicator color={theme.colors.primary} /> : null}
      </View>

      <Card style={styles.calorieCard}>
        <Text style={styles.calorieLabel}>剩余热量</Text>
        <Text style={[styles.calorieValue, remaining < 0 && styles.over]}>
          {Math.abs(remaining)}
          <Text style={styles.calorieUnit}> kcal {remaining < 0 ? '超出' : '可用'}</Text>
        </Text>
        <View style={styles.equation}>
          <Equation label="目标" value={targets.calories} />
          <Text style={styles.operator}>−</Text>
          <Equation label="已摄入" value={Math.round(totals.calories)} />
          <Text style={styles.operator}>=</Text>
          <Equation label={remaining < 0 ? '超出' : '剩余'} value={Math.abs(remaining)} />
        </View>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>宏量营养素</Text>
        <ProgressBar
          label="蛋白质"
          value={totals.protein}
          target={targets.protein}
          color={theme.colors.protein}
        />
        <ProgressBar
          label="碳水"
          value={totals.carbs}
          target={targets.carbs}
          color={theme.colors.carbs}
        />
        <ProgressBar
          label="脂肪"
          value={totals.fat}
          target={targets.fat}
          color={theme.colors.fat}
        />
      </Card>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>今日记录</Text>
        <Pressable onPress={() => router.push('/(tabs)/record')} style={styles.addLink}>
          <Ionicons name="add-circle" size={20} color={theme.colors.primary} />
          <Text style={styles.addLinkText}>添加</Text>
        </Pressable>
      </View>

      {meals.length === 0 ? (
        <Card style={styles.empty}>
          <Ionicons name="restaurant-outline" size={34} color={theme.colors.textMuted} />
          <Text style={styles.emptyTitle}>还没有饮食记录</Text>
          <Text style={styles.emptyText}>拍一张餐食照片，或从本地食物库手动添加。</Text>
          <AppButton label="记录第一餐" onPress={() => router.push('/(tabs)/record')} />
        </Card>
      ) : (
        meals.map((meal) => (
          <Pressable
            key={meal.id}
            onPress={() => router.push({ pathname: '/edit-meal', params: { id: String(meal.id) } })}
          >
            <Card style={styles.mealCard}>
              <View style={styles.mealTop}>
                <View style={styles.mealTitleRow}>
                  <View style={styles.mealIcon}>
                    <Ionicons name="restaurant" size={17} color={theme.colors.primary} />
                  </View>
                  <View>
                    <Text style={styles.mealTitle}>{MEAL_LABELS[meal.mealType]}</Text>
                    <Text style={styles.mealTime}>
                      {new Date(meal.eatenAt).toLocaleTimeString('zh-CN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                </View>
                <Text style={styles.mealCalories}>{Math.round(meal.totals.calories)} kcal</Text>
              </View>
              <Text style={styles.foodNames} numberOfLines={2}>
                {meal.items.map((item) => item.name).join('、')}
              </Text>
              <Text style={styles.mealMacros}>
                蛋白质 {Math.round(meal.totals.protein)}g · 碳水 {Math.round(meal.totals.carbs)}g ·
                脂肪 {Math.round(meal.totals.fat)}g
              </Text>
            </Card>
          </Pressable>
        ))
      )}

      <Text style={styles.disclaimer}>营养结果为估算值，不用于医疗诊断或治疗决策。</Text>
    </Screen>
  );
}

function Equation({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.equationItem}>
      <Text style={styles.equationValue}>{value}</Text>
      <Text style={styles.equationLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  kicker: {
    color: theme.colors.accent,
    fontWeight: '800',
  },
  title: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: '800',
    marginTop: 4,
  },
  calorieCard: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  calorieLabel: {
    color: '#DDEBDD',
    fontSize: 14,
    fontWeight: '600',
  },
  calorieValue: {
    color: '#FFFFFF',
    fontSize: 40,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  calorieUnit: {
    fontSize: 14,
    fontWeight: '600',
  },
  over: {
    color: '#FFD5CE',
  },
  equation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  equationItem: {
    alignItems: 'center',
  },
  equationValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  equationLabel: {
    color: '#DDEBDD',
    fontSize: 11,
    marginTop: 2,
  },
  operator: {
    color: '#BBD1BD',
    fontSize: 18,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  addLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addLinkText: {
    color: theme.colors.primary,
    fontWeight: '700',
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 26,
  },
  emptyTitle: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  emptyText: {
    color: theme.colors.textMuted,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 6,
  },
  mealCard: {
    gap: 8,
  },
  mealTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mealTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  mealIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primarySoft,
  },
  mealTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  mealTime: {
    color: theme.colors.textMuted,
    fontSize: 12,
  },
  mealCalories: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  foodNames: {
    color: theme.colors.text,
    lineHeight: 20,
  },
  mealMacros: {
    color: theme.colors.textMuted,
    fontSize: 12,
  },
  disclaimer: {
    color: theme.colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
  },
});
