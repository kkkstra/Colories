import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { EnergyRail } from '@/components/ui/EnergyRail';
import { MacroStrip } from '@/components/ui/MacroStrip';
import { Screen } from '@/components/ui/Screen';
import { theme } from '@/constants/Theme';
import { useApp } from '@/context/AppContext';
import { formatChineseDate, recentDateKeys, toLocalDateKey } from '@/lib/date';
import { getDayTotals, getMealsForDate, type DaySummary } from '@/lib/database';
import { getMealDisplayTitle } from '@/lib/mealTitle';
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
        <Text style={styles.title}>历史</Text>
        <View style={styles.period}>
          <Ionicons name="pulse" size={16} color={theme.colors.primary} />
          <Text style={styles.periodText}>14 天</Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.dateRail}
      >
        {dates.map((dateKey) => {
          const selected = dateKey === selectedDate;
          const date = new Date(`${dateKey}T12:00:00`);
          const dayCalories = summaries[dateKey]?.calories ?? 0;
          const dayTarget = targets?.calories ?? 2000;
          const progress = Math.min(1, dayCalories / dayTarget);
          return (
            <Pressable
              key={dateKey}
              accessibilityState={{ selected }}
              onPress={() => setSelectedDate(dateKey)}
              style={[styles.dateCard, selected && styles.dateCardSelected]}
            >
              <Text style={[styles.weekday, selected && styles.selectedMuted]}>
                {date.toLocaleDateString('zh-CN', { weekday: 'short' })}
              </Text>
              <Text style={[styles.day, selected && styles.selectedText]}>{date.getDate()}</Text>
              <View style={[styles.miniRail, selected && styles.miniRailSelected]}>
                <View
                  style={[
                    styles.miniFill,
                    {
                      width: `${progress * 100}%`,
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
        <View pointerEvents="none" style={styles.summaryAccent} />
        <View style={styles.summaryTop}>
          <Text style={styles.summaryDate}>{formatChineseDate(selectedDate)}</Text>
          <View style={styles.summaryRight}>
            <Text style={styles.summaryCalories}>
              {Math.round(selectedSummary?.calories ?? 0)}
            </Text>
            <Text style={styles.summaryUnit}>kcal</Text>
          </View>
        </View>
        <EnergyRail
          value={selectedSummary?.calories ?? 0}
          target={targets?.calories ?? 2000}
        />
        <View style={styles.summaryMacros}>
          <SummaryMacro label="蛋" value={selectedSummary?.protein ?? 0} color={theme.colors.protein} />
          <SummaryMacro label="碳" value={selectedSummary?.carbs ?? 0} color={theme.colors.carbs} />
          <SummaryMacro label="脂" value={selectedSummary?.fat ?? 0} color={theme.colors.fat} />
        </View>
      </View>

      <View style={styles.mealHeader}>
        <Text style={styles.mealHeaderTitle}>餐食</Text>
        <Text style={styles.mealCount}>{meals.length}</Text>
      </View>

      {meals.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Ionicons name="calendar-clear-outline" size={25} color={theme.colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>这一天没有记录</Text>
        </View>
      ) : (
        meals.map((meal) => (
          <Pressable
            key={meal.id}
            onPress={() => router.push({ pathname: '/edit-meal', params: { id: String(meal.id) } })}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Card variant="base" style={styles.mealCard}>
              <View style={styles.mealIcon}>
                <Ionicons name={MEAL_ICONS[meal.mealType]} size={20} color={theme.colors.primary} />
              </View>
              <View style={styles.mealBody}>
                <View style={styles.mealTop}>
                  <View style={styles.flex}>
                    <Text style={styles.mealMeta}>
                      {MEAL_LABELS[meal.mealType]} ·{' '}
                      {new Date(meal.eatenAt).toLocaleTimeString('zh-CN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                    <Text style={styles.foods} numberOfLines={1}>
                      {getMealDisplayTitle(meal)}
                    </Text>
                  </View>
                  <Text style={styles.mealCalories}>{Math.round(meal.totals.calories)}</Text>
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

function SummaryMacro({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.summaryMacro}>
      <View style={[styles.summaryMacroDot, { backgroundColor: color }]} />
      <Text style={styles.summaryMacroLabel}>{label}</Text>
      <Text style={styles.summaryMacroValue}>{Math.round(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  title: {
    color: theme.colors.text,
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -1.1,
  },
  period: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: theme.colors.primarySoft,
  },
  periodText: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: '900',
  },
  dateRail: {
    gap: 8,
    paddingVertical: 2,
  },
  dateCard: {
    width: 58,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 18,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    boxShadow: theme.shadows.small,
  },
  dateCardSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
    boxShadow: theme.shadows.primary,
  },
  weekday: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  day: {
    color: theme.colors.text,
    fontSize: 22,
    lineHeight: 25,
    fontWeight: '900',
  },
  selectedText: {
    color: '#FFFFFF',
  },
  selectedMuted: {
    color: '#DCE6FF',
  },
  miniRail: {
    width: 34,
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.colors.surfaceMuted,
    overflow: 'hidden',
  },
  miniRailSelected: {
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  miniFill: {
    height: '100%',
    minWidth: 2,
    borderRadius: 3,
  },
  summary: {
    backgroundColor: theme.colors.surfaceRaised,
    borderWidth: 1,
    borderColor: '#FFFFFF',
    borderRadius: 24,
    borderCurve: 'continuous',
    padding: 20,
    gap: 17,
    overflow: 'hidden',
    boxShadow: theme.shadows.large,
  },
  summaryAccent: {
    position: 'absolute',
    left: 0,
    top: 18,
    width: 6,
    height: 88,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
    backgroundColor: theme.colors.primary,
  },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryDate: {
    color: theme.colors.text,
    fontSize: 19,
    fontWeight: '900',
  },
  summaryRight: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  summaryCalories: {
    color: theme.colors.text,
    fontSize: 34,
    lineHeight: 36,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  summaryUnit: {
    color: theme.colors.textFaint,
    fontSize: 10,
    fontWeight: '800',
    paddingBottom: 4,
  },
  summaryMacros: {
    flexDirection: 'row',
    gap: 8,
  },
  summaryMacro: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 11,
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: theme.colors.surfaceInset,
  },
  summaryMacroDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  summaryMacroLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
  },
  summaryMacroValue: {
    flex: 1,
    color: theme.colors.text,
    textAlign: 'right',
    fontSize: 15,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  mealHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingTop: 5,
  },
  mealHeaderTitle: {
    color: theme.colors.text,
    fontSize: 21,
    fontWeight: '900',
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
  },
  empty: {
    minHeight: 104,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 17,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colors.borderStrong,
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceInset,
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 17,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
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
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealBody: {
    flex: 1,
    gap: 9,
  },
  mealTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  flex: {
    flex: 1,
    gap: 3,
  },
  mealMeta: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
  },
  mealCalories: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  foods: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.72,
  },
});
