import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { Card } from '@/components/ui/Card';
import { EnergyRail } from '@/components/ui/EnergyRail';
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
  const goalState =
    remaining < 0 ? '今日已超出目标' : remaining < targets.calories * 0.18 ? '接近今日目标' : '今日节奏正常';
  return (
    <Screen refreshControl={undefined}>
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>燃卡 / DAILY FUEL</Text>
          <Text style={styles.title}>{formatChineseDate(dateKey)}</Text>
        </View>
        <View style={styles.headerStatus}>
          <View style={[styles.statusDot, remaining < 0 && styles.statusDotOver]} />
          <Text style={styles.headerStatusText}>{refreshing ? '同步中' : goalState}</Text>
        </View>
      </View>

      <View style={styles.dashboard}>
        <View style={styles.heroTop}>
          <View>
            <Text style={styles.calorieLabel}>{remaining < 0 ? '超出目标' : '还可摄入'}</Text>
            <Text style={[styles.calorieValue, remaining < 0 && styles.over]}>
              {Math.abs(remaining)}
            </Text>
            <Text style={styles.calorieUnit}>KCAL</Text>
          </View>
          <View style={styles.goalStamp}>
            <Text style={styles.goalStampLabel}>DAILY{'\n'}TARGET</Text>
            <Text style={styles.goalStampValue}>{targets.calories}</Text>
          </View>
        </View>
        <EnergyRail value={totals.calories} target={targets.calories} />

        <View style={styles.macroDivider} />
        <View style={styles.macroHeader}>
          <Text style={styles.panelEyebrow}>MACRO SPLIT</Text>
          <Text style={styles.panelHint}>已摄入 / 每日目标</Text>
        </View>
        <View style={styles.macroStack}>
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
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionIndex}>MEALS / {String(meals.length).padStart(2, '0')}</Text>
          <Text style={styles.sectionTitle}>今日进食记录</Text>
        </View>
        <Pressable onPress={() => router.push('/(tabs)/record')} style={styles.addLink}>
          <Text style={styles.addLinkText}>添加一餐</Text>
          <Ionicons name="arrow-forward" size={17} color={theme.colors.primary} />
        </Pressable>
      </View>

      {meals.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Ionicons name="camera-outline" size={25} color={theme.colors.primary} />
          </View>
          <View style={styles.emptyCopy}>
            <Text style={styles.emptyTitle}>今天的第一餐还没入场</Text>
            <Text style={styles.emptyText}>拍照识别，确认份量后再保存。</Text>
          </View>
          <AppButton
            label="记录第一餐"
            icon="add"
            onPress={() => router.push('/(tabs)/record')}
            style={styles.emptyButton}
          />
        </View>
      ) : (
        meals.map((meal, index) => (
          <Pressable
            key={meal.id}
            onPress={() => router.push({ pathname: '/edit-meal', params: { id: String(meal.id) } })}
          >
            <Card style={styles.mealCard}>
              <View style={styles.mealIndex}>
                <Text style={styles.mealIndexText}>{String(index + 1).padStart(2, '0')}</Text>
                <View style={styles.mealLine} />
              </View>
              <View style={styles.mealBody}>
                <View style={styles.mealTop}>
                  <View>
                    <Text style={styles.mealTime}>
                      {new Date(meal.eatenAt).toLocaleTimeString('zh-CN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {'  '}
                      {MEAL_LABELS[meal.mealType]}
                    </Text>
                    <Text style={styles.mealTitle} numberOfLines={1}>
                      {meal.items.map((item) => item.name).join('、')}
                    </Text>
                  </View>
                  <View style={styles.mealCaloriesGroup}>
                    <Text style={styles.mealCalories}>{Math.round(meal.totals.calories)}</Text>
                    <Text style={styles.mealCaloriesUnit}>KCAL</Text>
                  </View>
                </View>
                <View style={styles.mealMacroRow}>
                  <MacroTag label="P" value={meal.totals.protein} color={theme.colors.protein} />
                  <MacroTag label="C" value={meal.totals.carbs} color={theme.colors.carbs} />
                  <MacroTag label="F" value={meal.totals.fat} color={theme.colors.fat} />
                  <Ionicons name="chevron-forward" size={17} color={theme.colors.textFaint} />
                </View>
              </View>
            </Card>
          </Pressable>
        ))
      )}

      <View style={styles.disclaimerRow}>
        <Ionicons name="information-circle-outline" size={15} color={theme.colors.textFaint} />
        <Text style={styles.disclaimer}>营养结果为估算值，不用于医疗诊断或治疗决策。</Text>
      </View>
    </Screen>
  );
}

function MacroTag({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.macroTag}>
      <View style={[styles.macroTagDot, { backgroundColor: color }]} />
      <Text style={styles.macroTagText}>
        {label} {Math.round(value)}g
      </Text>
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
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  brand: {
    color: theme.colors.primary,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  title: {
    color: theme.colors.text,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -1,
    marginTop: 5,
  },
  headerStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingBottom: 5,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 2,
    backgroundColor: theme.colors.success,
  },
  statusDotOver: {
    backgroundColor: theme.colors.accent,
  },
  headerStatusText: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
  },
  dashboard: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    borderRadius: theme.radius.large,
    padding: 22,
    gap: 17,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  calorieLabel: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: '800',
  },
  calorieValue: {
    color: theme.colors.ink,
    fontSize: 58,
    lineHeight: 64,
    fontWeight: '900',
    letterSpacing: -3,
    fontVariant: ['tabular-nums'],
  },
  calorieUnit: {
    color: theme.colors.textFaint,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.8,
  },
  over: {
    color: theme.colors.accent,
  },
  goalStamp: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 8,
    borderColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '4deg' }],
  },
  goalStampLabel: {
    color: theme.colors.primary,
    fontSize: 8,
    lineHeight: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  goalStampValue: {
    color: theme.colors.ink,
    fontSize: 17,
    lineHeight: 20,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  macroDivider: {
    height: 1,
    backgroundColor: theme.colors.border,
  },
  macroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  panelEyebrow: {
    color: theme.colors.text,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },
  panelHint: {
    color: theme.colors.textFaint,
    fontSize: 10,
    fontWeight: '700',
  },
  macroStack: {
    gap: 14,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  sectionIndex: {
    color: theme.colors.primary,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
    marginBottom: 3,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  addLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 8,
  },
  addLinkText: {
    color: theme.colors.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  empty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colors.borderStrong,
    borderRadius: theme.radius.medium,
    padding: 20,
    gap: 14,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCopy: {
    gap: 4,
  },
  emptyTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  emptyText: {
    color: theme.colors.textMuted,
    lineHeight: 21,
  },
  emptyButton: {
    alignSelf: 'flex-start',
    minWidth: 150,
  },
  mealCard: {
    flexDirection: 'row',
    gap: 14,
    padding: 0,
    overflow: 'hidden',
  },
  mealIndex: {
    width: 48,
    backgroundColor: theme.colors.ink,
    alignItems: 'center',
    paddingTop: 18,
  },
  mealIndexText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },
  mealLine: {
    width: 1,
    flex: 1,
    marginTop: 10,
    backgroundColor: '#344054',
  },
  mealBody: {
    flex: 1,
    paddingVertical: 16,
    paddingRight: 16,
    gap: 12,
  },
  mealTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  mealTitle: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '900',
    marginTop: 4,
  },
  mealTime: {
    color: theme.colors.primary,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  mealCaloriesGroup: {
    alignItems: 'flex-end',
  },
  mealCalories: {
    color: theme.colors.text,
    fontSize: 23,
    lineHeight: 25,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  mealCaloriesUnit: {
    color: theme.colors.textFaint,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
  },
  mealMacroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  macroTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  macroTagDot: {
    width: 6,
    height: 6,
    borderRadius: 2,
  },
  macroTagText: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  disclaimerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  disclaimer: {
    color: theme.colors.textFaint,
    fontSize: 11,
    textAlign: 'center',
  },
});
