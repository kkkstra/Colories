import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { EnergyRail } from '@/components/ui/EnergyRail';
import { MacroStrip } from '@/components/ui/MacroStrip';
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

const MEAL_ICONS: Record<MealType, keyof typeof Ionicons.glyphMap> = {
  breakfast: 'sunny-outline',
  lunch: 'restaurant-outline',
  dinner: 'moon-outline',
  snack: 'cafe-outline',
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
  const progress = targets.calories > 0 ? totals.calories / targets.calories : 0;
  const goalState =
    remaining < 0 ? '已超出目标' : remaining < targets.calories * 0.18 ? '接近目标' : '节奏正常';

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>{formatChineseDate(dateKey)}</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, remaining < 0 && styles.statusDotOver]} />
            <Text style={styles.statusText}>{refreshing ? '同步中' : goalState}</Text>
          </View>
        </View>
        <Pressable
          accessibilityLabel="记录一餐"
          accessibilityRole="button"
          onPress={() => router.push('/(tabs)/record')}
          style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}
        >
          <Ionicons name="add" size={25} color="#FFFFFF" />
        </Pressable>
      </View>

      <View style={styles.dashboard}>
        <View style={styles.hero}>
          <View>
            <Text style={styles.calorieLabel}>{remaining < 0 ? '超出' : '剩余'}</Text>
            <View style={styles.calorieRow}>
              <Text style={[styles.calorieValue, remaining < 0 && styles.over]}>
                {Math.abs(remaining)}
              </Text>
              <Text style={styles.calorieUnit}>kcal</Text>
            </View>
          </View>
          <FuelGauge progress={progress} over={remaining < 0} />
        </View>

        <EnergyRail value={totals.calories} target={targets.calories} />

        <View style={styles.macroGrid}>
          <MacroTile
            label="蛋"
            accessibilityName="蛋白质"
            value={totals.protein}
            target={targets.protein}
            color={theme.colors.protein}
          />
          <MacroTile
            label="碳"
            accessibilityName="碳水"
            value={totals.carbs}
            target={targets.carbs}
            color={theme.colors.carbs}
          />
          <MacroTile
            label="脂"
            accessibilityName="脂肪"
            value={totals.fat}
            target={targets.fat}
            color={theme.colors.fat}
          />
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>今日餐食</Text>
          <Text style={styles.mealCount}>{meals.length}</Text>
        </View>
        <Pressable
          accessibilityLabel="添加餐食"
          accessibilityRole="button"
          onPress={() => router.push('/(tabs)/record')}
          style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
        >
          <Ionicons name="add" size={20} color={theme.colors.primary} />
        </Pressable>
      </View>

      {meals.length === 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/(tabs)/record')}
          style={({ pressed }) => [styles.empty, pressed && styles.pressed]}
        >
          <View style={styles.emptyIcon}>
            <Ionicons name="camera" size={29} color={theme.colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>拍下今天的第一餐</Text>
          <Ionicons name="arrow-forward" size={20} color={theme.colors.primary} />
        </Pressable>
      ) : (
        meals.map((meal) => (
          <Pressable
            key={meal.id}
            onPress={() => router.push({ pathname: '/edit-meal', params: { id: String(meal.id) } })}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Card style={styles.mealCard}>
              <View style={styles.mealIcon}>
                <Ionicons name={MEAL_ICONS[meal.mealType]} size={21} color={theme.colors.primary} />
              </View>
              <View style={styles.mealBody}>
                <View style={styles.mealTop}>
                  <View style={styles.mealCopy}>
                    <Text style={styles.mealMeta}>
                      {MEAL_LABELS[meal.mealType]} ·{' '}
                      {new Date(meal.eatenAt).toLocaleTimeString('zh-CN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                    <Text style={styles.mealTitle} numberOfLines={1}>
                      {meal.items.map((item) => item.name).join('、')}
                    </Text>
                  </View>
                  <View style={styles.mealCaloriesGroup}>
                    <Text style={styles.mealCalories}>{Math.round(meal.totals.calories)}</Text>
                    <Text style={styles.mealCaloriesUnit}>kcal</Text>
                  </View>
                </View>
                <MacroStrip
                  protein={meal.totals.protein}
                  carbs={meal.totals.carbs}
                  fat={meal.totals.fat}
                />
              </View>
              <Ionicons name="chevron-forward" size={17} color={theme.colors.textFaint} />
            </Card>
          </Pressable>
        ))
      )}
    </Screen>
  );
}

function FuelGauge({ progress, over }: { progress: number; over: boolean }) {
  const activeSegments = Math.min(8, Math.max(0, Math.ceil(progress * 8)));

  return (
    <View
      accessibilityLabel={`今日热量进度 ${Math.round(progress * 100)}%`}
      style={[styles.gauge, over && styles.gaugeOver]}
    >
      <Ionicons
        name={over ? 'warning' : 'flash'}
        size={19}
        color={over ? theme.colors.accent : theme.colors.primary}
      />
      <View style={styles.gaugeSegments}>
        {Array.from({ length: 8 }, (_, index) => (
          <View
            key={index}
            style={[
              styles.gaugeSegment,
              index < activeSegments && {
                backgroundColor: over ? theme.colors.accent : theme.colors.primary,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

function MacroTile({
  label,
  accessibilityName,
  value,
  target,
  color,
}: {
  label: string;
  accessibilityName: string;
  value: number;
  target: number;
  color: string;
}) {
  const progress = target > 0 ? Math.min(1, value / target) : 0;

  return (
    <View
      accessibilityLabel={`${accessibilityName} ${Math.round(value)} 克，目标 ${Math.round(target)} 克`}
      style={styles.macroTile}
    >
      <View style={styles.macroTileHeader}>
        <View style={[styles.macroDot, { backgroundColor: color }]} />
        <Text style={styles.macroLabel}>{label}</Text>
      </View>
      <Text style={styles.macroValue}>{Math.round(value)}</Text>
      <View style={styles.macroTrack}>
        <View style={[styles.macroFill, { backgroundColor: color, width: `${progress * 100}%` }]} />
      </View>
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
    marginTop: 2,
  },
  headerCopy: {
    gap: 5,
  },
  title: {
    color: theme.colors.text,
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -1.1,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: theme.colors.success,
  },
  statusDotOver: {
    backgroundColor: theme.colors.accent,
  },
  statusText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  headerAction: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
  dashboard: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.large,
    padding: 20,
    gap: 18,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 18,
  },
  calorieLabel: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: '800',
  },
  calorieRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  calorieValue: {
    color: theme.colors.ink,
    fontSize: 62,
    lineHeight: 68,
    fontWeight: '900',
    letterSpacing: -3.2,
    fontVariant: ['tabular-nums'],
  },
  calorieUnit: {
    color: theme.colors.textFaint,
    fontSize: 12,
    fontWeight: '800',
    paddingBottom: 11,
  },
  over: {
    color: theme.colors.accent,
  },
  gauge: {
    width: 84,
    height: 96,
    borderRadius: 24,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  gaugeOver: {
    backgroundColor: theme.colors.accentSoft,
  },
  gaugeSegments: {
    width: 48,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  gaugeSegment: {
    width: 9,
    height: 9,
    borderRadius: 3,
    backgroundColor: '#D3DAE5',
  },
  macroGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  macroTile: {
    flex: 1,
    minWidth: 0,
    padding: 12,
    borderRadius: 13,
    backgroundColor: theme.colors.background,
    gap: 7,
  },
  macroTileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  macroDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  macroLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
  },
  macroValue: {
    color: theme.colors.text,
    fontSize: 21,
    lineHeight: 23,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  macroTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.surfaceMuted,
    overflow: 'hidden',
  },
  macroFill: {
    height: '100%',
    borderRadius: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  mealCount: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceMuted,
    color: theme.colors.textMuted,
    textAlign: 'center',
    lineHeight: 24,
    fontSize: 11,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  addButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    minHeight: 108,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 17,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colors.borderStrong,
    borderRadius: 18,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  mealCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  mealIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealBody: {
    flex: 1,
    gap: 10,
  },
  mealTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  mealCopy: {
    flex: 1,
    gap: 3,
  },
  mealMeta: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
  },
  mealTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  mealCaloriesGroup: {
    alignItems: 'flex-end',
  },
  mealCalories: {
    color: theme.colors.text,
    fontSize: 20,
    lineHeight: 22,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  mealCaloriesUnit: {
    color: theme.colors.textFaint,
    fontSize: 9,
    fontWeight: '700',
  },
});
