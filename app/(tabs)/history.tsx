import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { theme } from '@/constants/Theme';
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
      <View>
        <Text style={styles.kicker}>最近 14 天</Text>
        <Text style={styles.title}>饮食历史</Text>
      </View>

      <View style={styles.dateGrid}>
        {dates.map((dateKey) => {
          const selected = dateKey === selectedDate;
          const date = new Date(`${dateKey}T12:00:00`);
          return (
            <Pressable
              key={dateKey}
              onPress={() => setSelectedDate(dateKey)}
              style={[styles.dateCard, selected && styles.dateCardSelected]}
            >
              <Text style={[styles.weekday, selected && styles.selectedText]}>
                {date.toLocaleDateString('zh-CN', { weekday: 'short' })}
              </Text>
              <Text style={[styles.day, selected && styles.selectedText]}>{date.getDate()}</Text>
              <View
                style={[
                  styles.dot,
                  (summaries[dateKey]?.calories ?? 0) > 0 && styles.dotFilled,
                  selected && styles.dotSelected,
                ]}
              />
            </Pressable>
          );
        })}
      </View>

      <Card style={styles.summary}>
        <View>
          <Text style={styles.summaryDate}>{formatChineseDate(selectedDate)}</Text>
          <Text style={styles.muted}>{meals.length} 餐记录</Text>
        </View>
        <View style={styles.summaryRight}>
          <Text style={styles.summaryCalories}>
            {Math.round(selectedSummary?.calories ?? 0)}
          </Text>
          <Text style={styles.muted}>kcal</Text>
        </View>
      </Card>

      {meals.length === 0 ? (
        <Card style={styles.empty}>
          <Ionicons name="calendar-clear-outline" size={34} color={theme.colors.textMuted} />
          <Text style={styles.emptyTitle}>这一天没有记录</Text>
        </Card>
      ) : (
        meals.map((meal) => (
          <Pressable
            key={meal.id}
            onPress={() => router.push({ pathname: '/edit-meal', params: { id: String(meal.id) } })}
          >
            <Card>
              <View style={styles.mealHeader}>
                <Text style={styles.mealTitle}>{MEAL_LABELS[meal.mealType]}</Text>
                <Text style={styles.mealCalories}>{Math.round(meal.totals.calories)} kcal</Text>
              </View>
              <Text style={styles.foods}>{meal.items.map((item) => item.name).join('、')}</Text>
              <Text style={styles.muted}>
                蛋白质 {Math.round(meal.totals.protein)}g · 碳水 {Math.round(meal.totals.carbs)}g ·
                脂肪 {Math.round(meal.totals.fat)}g
              </Text>
            </Card>
          </Pressable>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  dateGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dateCard: {
    width: 44,
    height: 68,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  dateCardSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  weekday: {
    color: theme.colors.textMuted,
    fontSize: 10,
  },
  day: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '800',
    marginVertical: 2,
  },
  selectedText: {
    color: '#FFFFFF',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: theme.colors.accent,
  },
  dotSelected: {
    backgroundColor: '#F7B68C',
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryDate: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  summaryRight: {
    alignItems: 'flex-end',
  },
  summaryCalories: {
    color: theme.colors.primary,
    fontSize: 25,
    fontWeight: '900',
  },
  muted: {
    color: theme.colors.textMuted,
    fontSize: 12,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  emptyTitle: {
    color: theme.colors.text,
    fontWeight: '800',
  },
  mealHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mealTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  mealCalories: {
    color: theme.colors.primary,
    fontWeight: '800',
  },
  foods: {
    color: theme.colors.text,
    lineHeight: 20,
  },
});
