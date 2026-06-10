import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { EnergyRail } from '@/components/ui/EnergyRail';
import { Screen } from '@/components/ui/Screen';
import { theme } from '@/constants/Theme';
import { useApp } from '@/context/AppContext';
import { formatChineseDate, recentDateKeys, toLocalDateKey } from '@/lib/date';
import { getDayTotals, getMealsForDate, type DaySummary } from '@/lib/database';
import type { MealRecord, MealType } from '@/types/domain';

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  snack: '加餐',
};

export default function HistoryScreen() {
  const db = useSQLiteContext();
  const { targets } = useApp();
  const dates = recentDateKeys(14);
  const [selectedDate, setSelectedDate] = useState(toLocalDateKey());
  const [summaries, setSummaries] = useState<Record<string, DaySummary>>({});
  const [meals, setMeals] = useState<MealRecord[]>([]);

  const load = useCallback(async () => {
    const [nextSummaries, nextMeals] = await Promise.all([
      Promise.all(dates.map((dateKey) => getDayTotals(db, dateKey))),
      getMealsForDate(db, selectedDate),
    ]);
    setSummaries(
      Object.fromEntries(nextSummaries.map((summary) => [summary.dateKey, summary])),
    );
    setMeals(nextMeals);
  }, [dates.join(','), db, selectedDate]);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => undefined);
    }, [load]),
  );

  const selectedSummary = summaries[selectedDate];

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.kicker}>14 DAY / CYCLE</Text>
        <Text style={styles.title}>饮食训练日志</Text>
        <Text style={styles.subtitle}>按天回看摄入趋势，点开任意一餐即可修正。</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.dateRail}
      >
        {dates.map((dateKey, index) => {
          const selected = dateKey === selectedDate;
          const date = new Date(`${dateKey}T12:00:00`);
          const dayCalories = summaries[dateKey]?.calories ?? 0;
          const dayTarget = targets?.calories ?? 2000;
          const progress = Math.min(1, dayCalories / dayTarget);
          return (
            <Pressable
              key={dateKey}
              onPress={() => setSelectedDate(dateKey)}
              style={[styles.dateCard, selected && styles.dateCardSelected]}
            >
              <Text style={[styles.railIndex, selected && styles.selectedMuted]}>
                {String(dates.length - index).padStart(2, '0')}
              </Text>
              <Text style={[styles.weekday, selected && styles.selectedMuted]}>
                {date.toLocaleDateString('zh-CN', { weekday: 'short' })}
              </Text>
              <Text style={[styles.day, selected && styles.selectedText]}>{date.getDate()}</Text>
              <View style={[styles.miniRail, selected && styles.miniRailSelected]}>
                <View
                  style={[
                    styles.miniFill,
                    {
                      height: `${progress * 100}%`,
                      backgroundColor:
                        dayCalories > dayTarget ? theme.colors.accent : theme.colors.primary,
                    },
                  ]}
                />
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.summary}>
        <View style={styles.summaryTop}>
          <View>
            <Text style={styles.summaryKicker}>SELECTED DAY</Text>
            <Text style={styles.summaryDate}>{formatChineseDate(selectedDate)}</Text>
          </View>
          <View style={styles.summaryRight}>
            <Text style={styles.summaryCalories}>
              {Math.round(selectedSummary?.calories ?? 0)}
            </Text>
            <Text style={styles.summaryUnit}>KCAL / {meals.length} 餐</Text>
          </View>
        </View>
        <EnergyRail
          value={selectedSummary?.calories ?? 0}
          target={targets?.calories ?? 2000}
        />
        <View style={styles.summaryMacros}>
          <SummaryMacro label="蛋白质" value={selectedSummary?.protein ?? 0} color={theme.colors.protein} />
          <SummaryMacro label="碳水" value={selectedSummary?.carbs ?? 0} color={theme.colors.carbs} />
          <SummaryMacro label="脂肪" value={selectedSummary?.fat ?? 0} color={theme.colors.fat} />
        </View>
      </View>

      {meals.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="calendar-clear-outline" size={27} color={theme.colors.primary} />
          <View>
            <Text style={styles.emptyTitle}>这一天没有记录</Text>
            <Text style={styles.muted}>选择其他日期，或去记录今天的餐食。</Text>
          </View>
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
              </View>
              <View style={styles.mealBody}>
                <View style={styles.mealHeader}>
                  <Text style={styles.mealType}>{MEAL_LABELS[meal.mealType]}</Text>
                  <Text style={styles.mealCalories}>{Math.round(meal.totals.calories)} kcal</Text>
                </View>
                <Text style={styles.foods} numberOfLines={2}>
                  {meal.items.map((item) => item.name).join('、')}
                </Text>
                <Text style={styles.muted}>
                  P {Math.round(meal.totals.protein)}g · C {Math.round(meal.totals.carbs)}g · F{' '}
                  {Math.round(meal.totals.fat)}g
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textFaint} />
            </Card>
          </Pressable>
        ))
      )}
    </Screen>
  );
}

function SummaryMacro({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.summaryMacro}>
      <View style={[styles.summaryMacroLine, { backgroundColor: color }]} />
      <Text style={styles.summaryMacroValue}>{Math.round(value)}g</Text>
      <Text style={styles.summaryMacroLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: 5,
    marginTop: 4,
  },
  kicker: {
    color: theme.colors.primary,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  title: {
    color: theme.colors.text,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '900',
    letterSpacing: -1.2,
  },
  subtitle: {
    color: theme.colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  dateRail: {
    gap: 8,
    paddingVertical: 2,
  },
  dateCard: {
    width: 60,
    height: 114,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 10,
  },
  dateCardSelected: {
    backgroundColor: theme.colors.ink,
    borderColor: theme.colors.ink,
  },
  railIndex: {
    color: theme.colors.textFaint,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  weekday: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 5,
  },
  day: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '900',
    marginTop: 2,
  },
  selectedText: {
    color: '#FFFFFF',
  },
  selectedMuted: {
    color: '#AEB9CD',
  },
  miniRail: {
    width: 8,
    height: 32,
    borderRadius: 2,
    backgroundColor: theme.colors.surfaceMuted,
    marginTop: 7,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  miniRailSelected: {
    backgroundColor: '#344054',
  },
  miniFill: {
    width: '100%',
    minHeight: 2,
  },
  summary: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    borderRadius: theme.radius.large,
    padding: 20,
    gap: 17,
  },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryKicker: {
    color: theme.colors.primary,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  summaryDate: {
    color: theme.colors.text,
    fontSize: 19,
    fontWeight: '900',
    marginTop: 3,
  },
  summaryRight: {
    alignItems: 'flex-end',
  },
  summaryCalories: {
    color: theme.colors.text,
    fontSize: 32,
    lineHeight: 34,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  summaryUnit: {
    color: theme.colors.textFaint,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  summaryMacros: {
    flexDirection: 'row',
    gap: 8,
  },
  summaryMacro: {
    flex: 1,
    minWidth: 0,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  summaryMacroLine: {
    width: 24,
    height: 4,
    borderRadius: 2,
    marginBottom: 7,
  },
  summaryMacroValue: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  summaryMacroLabel: {
    color: theme.colors.textMuted,
    fontSize: 10,
    marginTop: 2,
  },
  muted: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  empty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 20,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colors.borderStrong,
    borderRadius: theme.radius.medium,
  },
  emptyTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  mealCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 0,
    overflow: 'hidden',
    gap: 0,
  },
  mealIndex: {
    alignSelf: 'stretch',
    width: 44,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealIndexText: {
    color: theme.colors.primary,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  mealBody: {
    flex: 1,
    padding: 15,
    gap: 6,
  },
  mealHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mealType: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  mealCalories: {
    color: theme.colors.primary,
    fontSize: 13,
    fontWeight: '900',
  },
  foods: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 21,
  },
});
