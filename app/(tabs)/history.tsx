import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { EnergyRail } from '@/components/ui/EnergyRail';
import { MacroStrip } from '@/components/ui/MacroStrip';
import { Screen } from '@/components/ui/Screen';
import { theme } from '@/constants/Theme';
import { useApp } from '@/context/AppContext';
import { formatChineseDate, toLocalDateKey } from '@/lib/date';
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

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

export default function HistoryScreen() {
  const db = useSQLiteContext();
  const { targets } = useApp();
  const [selectedDate, setSelectedDate] = useState(toLocalDateKey());
  const [calendarExpanded, setCalendarExpanded] = useState(false);
  const [visibleMonthKey, setVisibleMonthKey] = useState(() => monthKeyFromDateKey(toLocalDateKey()));
  const [summaries, setSummaries] = useState<Record<string, DaySummary>>({});
  const [meals, setMeals] = useState<MealRecord[]>([]);
  const calendarDates = useMemo(() => buildCalendarDateKeys(visibleMonthKey), [visibleMonthKey]);
  const calendarRows = useMemo(() => chunkDateKeys(calendarDates, 7), [calendarDates]);
  const selectedWeekDates = useMemo(() => buildWeekDateKeys(selectedDate), [selectedDate]);
  const displayedCalendarRows = calendarExpanded ? calendarRows : [selectedWeekDates];
  const displayedDateKeys = calendarExpanded ? calendarDates : selectedWeekDates;
  const summaryDateKeys = useMemo(
    () => Array.from(new Set([selectedDate, ...displayedDateKeys])),
    [displayedDateKeys, selectedDate],
  );

  const load = useCallback(async () => {
    const [nextSummaries, nextMeals] = await Promise.all([
      Promise.all(summaryDateKeys.map((dateKey) => getDayTotals(db, dateKey))),
      getMealsForDate(db, selectedDate),
    ]);
    setSummaries(
      Object.fromEntries(nextSummaries.map((summary) => [summary.dateKey, summary])),
    );
    setMeals(nextMeals);
  }, [summaryDateKeys, db, selectedDate]);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => undefined);
    }, [load]),
  );

  const selectedSummary = summaries[selectedDate];
  const visibleMonthDate = new Date(`${visibleMonthKey}-01T12:00:00`);
  const visibleMonthLabel = `${visibleMonthDate.getFullYear()}年${visibleMonthDate.getMonth() + 1}月`;
  const weekRangeLabel = formatWeekRange(selectedWeekDates);
  const todayDateKey = toLocalDateKey();

  const selectDate = (dateKey: string) => {
    setSelectedDate(dateKey);
    setVisibleMonthKey(monthKeyFromDateKey(dateKey));
  };

  const moveCalendarMonth = (offset: number) => {
    setVisibleMonthKey((current) => addMonthsToMonthKey(current, offset));
  };

  const moveCalendarPeriod = (offset: number) => {
    if (calendarExpanded) {
      moveCalendarMonth(offset);
      return;
    }
    const nextDateKey = addDaysToDateKey(selectedDate, offset * 7);
    selectDate(nextDateKey);
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>历史</Text>
      </View>

      <Card variant="base" style={styles.calendarCard}>
        <View style={styles.calendarHeader}>
          <Pressable
            accessibilityLabel={calendarExpanded ? '上个月' : '上一周'}
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => moveCalendarPeriod(-1)}
            style={({ pressed }) => [styles.calendarNavButton, pressed && styles.pressed]}
          >
            <Ionicons name="chevron-back" size={18} color={theme.colors.primary} />
          </Pressable>

          <View style={styles.calendarTitleGroup}>
            <Text style={styles.calendarMonthTitle}>
              {calendarExpanded ? visibleMonthLabel : weekRangeLabel}
            </Text>
          </View>

          <Pressable
            accessibilityLabel="回到今天"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => selectDate(todayDateKey)}
            style={({ pressed }) => [styles.calendarTodayButton, pressed && styles.pressed]}
          >
            <Text style={styles.calendarTodayButtonText}>今</Text>
          </Pressable>

          <Pressable
            accessibilityLabel={calendarExpanded ? '下个月' : '下一周'}
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => moveCalendarPeriod(1)}
            style={({ pressed }) => [styles.calendarNavButton, pressed && styles.pressed]}
          >
            <Ionicons name="chevron-forward" size={18} color={theme.colors.primary} />
          </Pressable>

          <Pressable
            accessibilityLabel={calendarExpanded ? '收起日历' : '展开日历'}
            accessibilityRole="button"
            accessibilityState={{ expanded: calendarExpanded }}
            onPress={() => setCalendarExpanded((current) => !current)}
            style={({ pressed }) => [styles.calendarExpandButton, pressed && styles.pressed]}
          >
            <Ionicons
              name={calendarExpanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={theme.colors.primary}
            />
          </Pressable>
        </View>

        <View style={styles.calendarBody}>
          <View style={styles.calendarWeekRow}>
            {WEEKDAY_LABELS.map((label) => (
              <Text key={label} style={styles.calendarWeekday}>
                {label}
              </Text>
            ))}
          </View>

          <View style={styles.calendarGrid}>
            {displayedCalendarRows.map((row, rowIndex) => (
              <View key={`calendar-row-${rowIndex}`} style={styles.calendarGridRow}>
                {row.map((dateKey) => {
                  const date = new Date(`${dateKey}T12:00:00`);
                  const selected = dateKey === selectedDate;
                  const activeMonthKey = calendarExpanded ? visibleMonthKey : monthKeyFromDateKey(selectedDate);
                  const inMonth = monthKeyFromDateKey(dateKey) === activeMonthKey;
                  const daySummary = summaries[dateKey];
                  const dayCalories = daySummary?.calories ?? 0;
                  const dayTarget = targets?.calories ?? 2000;
                  const hasData = dayCalories > 0;
                  const overTarget = dayCalories > dayTarget;
                  const progress = Math.min(1, dayCalories / dayTarget);

                  return (
                    <Pressable
                      key={dateKey}
                      accessibilityLabel={`查看 ${dateKey} 记录`}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => selectDate(dateKey)}
                      style={({ pressed }) => [
                        styles.calendarDay,
                        !inMonth && styles.calendarDayMuted,
                        selected && styles.calendarDaySelected,
                        dateKey === todayDateKey && !selected && styles.calendarDayToday,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.calendarDayText,
                          !inMonth && styles.calendarDayTextMuted,
                          selected && styles.calendarDayTextSelected,
                        ]}
                      >
                        {date.getDate()}
                      </Text>
                      <View
                        style={[
                          styles.calendarDayRail,
                          selected && styles.calendarDayRailSelected,
                        ]}
                      >
                        {hasData ? (
                          <View
                            style={[
                              styles.calendarDayFill,
                              {
                                width: `${progress * 100}%`,
                                backgroundColor: selected
                                  ? '#FFFFFF'
                                  : overTarget
                                    ? theme.colors.accent
                                    : theme.colors.primary,
                              },
                            ]}
                          />
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        </View>
      </Card>

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
          <SummaryMacro
            label="蛋"
            value={selectedSummary?.protein ?? 0}
            target={targets?.protein ?? 0}
            color={theme.colors.protein}
          />
          <SummaryMacro
            label="碳"
            value={selectedSummary?.carbs ?? 0}
            target={targets?.carbs ?? 0}
            color={theme.colors.carbs}
          />
          <SummaryMacro
            label="脂"
            value={selectedSummary?.fat ?? 0}
            target={targets?.fat ?? 0}
            color={theme.colors.fat}
          />
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

function SummaryMacro({
  label,
  value,
  target,
  color,
}: {
  label: string;
  value: number;
  target: number;
  color: string;
}) {
  return (
    <View style={styles.summaryMacro}>
      <View style={styles.summaryMacroTop}>
        <View style={styles.summaryMacroLabelGroup}>
          <View style={[styles.summaryMacroDot, { backgroundColor: color }]} />
          <Text style={styles.summaryMacroLabel}>{label}</Text>
        </View>
        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.68}
          numberOfLines={1}
          style={styles.summaryMacroValue}
        >
          {Math.round(value)}
        </Text>
      </View>
      <Text style={styles.summaryMacroLimit}>上限 {Math.round(target)}</Text>
    </View>
  );
}

function monthKeyFromDateKey(dateKey: string): string {
  return dateKey.slice(0, 7);
}

function addMonthsToMonthKey(monthKey: string, offset: number): string {
  const date = new Date(`${monthKey}-01T12:00:00`);
  date.setMonth(date.getMonth() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function buildCalendarDateKeys(monthKey: string): string[] {
  const firstOfMonth = new Date(`${monthKey}-01T12:00:00`);
  const mondayOffset = (firstOfMonth.getDay() + 6) % 7;
  const cursor = new Date(firstOfMonth);
  cursor.setDate(firstOfMonth.getDate() - mondayOffset);

  return Array.from({ length: 42 }, () => {
    const dateKey = toLocalDateKey(cursor);
    cursor.setDate(cursor.getDate() + 1);
    return dateKey;
  });
}

function buildWeekDateKeys(dateKey: string): string[] {
  const date = new Date(`${dateKey}T12:00:00`);
  const mondayOffset = (date.getDay() + 6) % 7;
  const cursor = new Date(date);
  cursor.setDate(date.getDate() - mondayOffset);

  return Array.from({ length: 7 }, () => {
    const nextDateKey = toLocalDateKey(cursor);
    cursor.setDate(cursor.getDate() + 1);
    return nextDateKey;
  });
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + days);
  return toLocalDateKey(date);
}

function formatWeekRange(dateKeys: string[]): string {
  const firstKey = dateKeys[0] ?? toLocalDateKey();
  const lastKey = dateKeys[dateKeys.length - 1] ?? firstKey;
  const first = new Date(`${firstKey}T12:00:00`);
  const last = new Date(`${lastKey}T12:00:00`);
  if (first.getFullYear() !== last.getFullYear()) {
    return `${first.getFullYear()}年${first.getMonth() + 1}月${first.getDate()}日-${last.getFullYear()}年${last.getMonth() + 1}月${last.getDate()}日`;
  }
  if (first.getMonth() !== last.getMonth()) {
    return `${first.getMonth() + 1}月${first.getDate()}日-${last.getMonth() + 1}月${last.getDate()}日`;
  }
  return `${first.getMonth() + 1}月${first.getDate()}日-${last.getDate()}日`;
}

function chunkDateKeys(dateKeys: string[], size: number): string[][] {
  return Array.from({ length: Math.ceil(dateKeys.length / size) }, (_, index) =>
    dateKeys.slice(index * size, index * size + size),
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
  calendarCard: {
    padding: 0,
    overflow: 'hidden',
    borderColor: '#FFFFFF',
  },
  calendarHeader: {
    minHeight: 68,
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  calendarTitleGroup: {
    flex: 1,
    minWidth: 0,
  },
  calendarTodayButton: {
    width: 36,
    height: 36,
    borderRadius: 13,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarTodayButtonText: {
    color: theme.colors.primary,
    fontSize: 13,
    fontWeight: '900',
  },
  calendarExpandButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarBody: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSoft,
    padding: 14,
    paddingTop: 12,
    gap: 12,
  },
  calendarNavButton: {
    width: 36,
    height: 36,
    borderRadius: 13,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.surfaceTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarMonthTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  calendarWeekRow: {
    flexDirection: 'row',
    gap: 6,
  },
  calendarWeekday: {
    flex: 1,
    color: theme.colors.textMuted,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '900',
  },
  calendarGrid: {
    gap: 6,
  },
  calendarGridRow: {
    flexDirection: 'row',
    gap: 6,
  },
  calendarDay: {
    flex: 1,
    minWidth: 0,
    aspectRatio: 1,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.surfaceInset,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  calendarDayMuted: {
    opacity: 0.45,
  },
  calendarDaySelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
    boxShadow: theme.shadows.primary,
  },
  calendarDayToday: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySoft,
  },
  calendarDayText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  calendarDayTextMuted: {
    color: theme.colors.textMuted,
  },
  calendarDayTextSelected: {
    color: '#FFFFFF',
  },
  calendarDayRail: {
    width: '58%',
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.surfaceMuted,
    overflow: 'hidden',
  },
  calendarDayRailSelected: {
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  calendarDayFill: {
    height: '100%',
    minWidth: 2,
    borderRadius: 2,
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
    gap: 7,
    padding: 10,
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: theme.colors.surfaceInset,
  },
  summaryMacroTop: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  summaryMacroLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 5,
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
    minWidth: 0,
    color: theme.colors.text,
    textAlign: 'right',
    fontSize: 17,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  summaryMacroLimit: {
    color: theme.colors.textMuted,
    textAlign: 'right',
    fontSize: 8,
    fontWeight: '800',
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
