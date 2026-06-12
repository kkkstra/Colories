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
import { generateMealSuggestionAdvice } from '@/lib/ai';
import { formatChineseDate, toLocalDateKey } from '@/lib/date';
import {
  getCachedMealSuggestionAdvice,
  getDayTotals,
  getManagedFoods,
  getMealsForDate,
  saveCachedMealSuggestionAdvice,
  type DaySummary,
} from '@/lib/database';
import {
  buildMealSuggestionData,
  buildFallbackMealSuggestion,
  getMealSuggestionLabel,
  resolveMealSuggestionAdvice,
  type MealSuggestionSource,
} from '@/lib/mealSuggestion';
import { inferMealSuggestionTargetFromDate } from '@/lib/mealTiming';
import { getMealDisplayTitle } from '@/lib/mealTitle';
import { getApiKey } from '@/lib/secureStorage';
import type {
  MealSuggestionAdvice,
  MealSuggestionFood,
  MealSuggestionScope,
  MealSuggestionTargetType,
  MacroValues,
  MealRecord,
  MealType,
} from '@/types/domain';

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

const MEAL_SUGGESTION_FOOD_QUERY_LIMIT = 1000;
const EMPTY_TOTALS: MacroValues = { calories: 0, protein: 0, carbs: 0, fat: 0 };

const mealSuggestionInFlight = new Map<string, Promise<MealSuggestionAdvice>>();
const failedMealSuggestionKeys = new Set<string>();

interface MealSuggestionState {
  advice: MealSuggestionAdvice;
  source: MealSuggestionSource;
  remaining: MacroValues;
  targetType: MealSuggestionTargetType;
  scope: MealSuggestionScope;
  mealLabel: string;
  targetDateKey: string;
  loading: boolean;
  message?: string;
}

export default function TodayScreen() {
  const db = useSQLiteContext();
  const { loading, profile, targets, providerConfig, hasApiKey } = useApp();
  const dateKey = toLocalDateKey();
  const [meals, setMeals] = useState<MealRecord[]>([]);
  const [totals, setTotals] = useState<DaySummary | null>(null);
  const [refreshing, setRefreshing] = useState(true);
  const [mealSuggestion, setMealSuggestion] = useState<MealSuggestionState | null>(null);

  const loadMealSuggestion = useCallback(
    async (nextTotals: DaySummary, nextMeals: MealRecord[]) => {
      if (!targets) {
        setMealSuggestion(null);
        return;
      }

      const suggestionTarget = inferMealSuggestionTargetFromDate(
        new Date(),
        nextMeals.map((meal) => meal.mealType),
      );
      const mealLabel = getMealSuggestionLabel(suggestionTarget.targetType);
      const suggestionTotals = suggestionTarget.scope === 'full_day' ? EMPTY_TOTALS : nextTotals;
      const foods = await getManagedFoods(db, {
        query: '',
        category: 'all',
        scope: 'all',
        limit: MEAL_SUGGESTION_FOOD_QUERY_LIMIT,
      });
      const suggestionData = buildMealSuggestionData({
        dateKey: suggestionTarget.dateKey,
        targetType: suggestionTarget.targetType,
        scope: suggestionTarget.scope,
        totals: suggestionTotals,
        targets,
        foods,
        providerConfig,
      });
      const fallback = buildFallbackMealSuggestion(suggestionData);
      const cacheId = `meal:${suggestionTarget.dateKey}:${suggestionTarget.targetType}`;
      const cacheKey = `${cacheId}:${suggestionData.dataHash}`;
      const cached = await getCachedMealSuggestionAdvice(db, cacheId);
      const apiKey = providerConfig && hasApiKey ? await getApiKey() : null;
      const canGenerate =
        Boolean(providerConfig && apiKey) &&
        suggestionData.hasNutritionData &&
        suggestionData.candidates.length > 0 &&
        !failedMealSuggestionKeys.has(cacheKey);

      if (cached?.dataHash !== suggestionData.dataHash) {
        setMealSuggestion({
          advice: fallback,
          source: 'fallback',
          remaining: suggestionData.remaining,
          targetType: suggestionTarget.targetType,
          scope: suggestionTarget.scope,
          mealLabel,
          targetDateKey: suggestionTarget.dateKey,
          loading: canGenerate,
          message: canGenerate ? buildMealSuggestionLoadingMessage(suggestionTarget.scope, mealLabel) : undefined,
        });
      }

      const resolution = await resolveMealSuggestionAdvice({
        dataHash: suggestionData.dataHash,
        cached,
        fallback,
        canGenerate,
        generate: async () => {
          const current = mealSuggestionInFlight.get(cacheKey);
          if (current) {
            return current;
          }
          const request = generateMealSuggestionAdvice(providerConfig!, apiKey!, {
            dateKey: suggestionTarget.dateKey,
            targetType: suggestionTarget.targetType,
            scope: suggestionTarget.scope,
            mealLabel,
            totals: suggestionTotals,
            targets,
            remaining: suggestionData.remaining,
            candidates: suggestionData.candidates,
          })
            .then((advice) => {
              failedMealSuggestionKeys.delete(cacheKey);
              return advice;
            })
            .catch((error) => {
              failedMealSuggestionKeys.add(cacheKey);
              throw error;
            })
            .finally(() => {
              mealSuggestionInFlight.delete(cacheKey);
            });
          mealSuggestionInFlight.set(cacheKey, request);
          return request;
        },
        save: async (advice) => {
          const saved = await saveCachedMealSuggestionAdvice(db, {
            id: cacheId,
            dataHash: suggestionData.dataHash,
            ...advice,
          });
          return saved;
        },
      });

      setMealSuggestion({
        advice: resolution.advice,
        source: resolution.source === 'cache' ? 'ai' : resolution.source,
        remaining: suggestionData.remaining,
        targetType: suggestionTarget.targetType,
        scope: suggestionTarget.scope,
        mealLabel,
        targetDateKey: suggestionTarget.dateKey,
        loading: false,
        message: suggestionData.hasNutritionData ? resolution.message : undefined,
      });
    },
    [dateKey, db, hasApiKey, providerConfig, targets],
  );

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [nextMeals, nextTotals] = await Promise.all([
        getMealsForDate(db, dateKey),
        getDayTotals(db, dateKey),
      ]);
      setMeals(nextMeals);
      setTotals(nextTotals);
      setRefreshing(false);
      await loadMealSuggestion(nextTotals, nextMeals);
    } catch {
      setRefreshing(false);
    }
  }, [dateKey, db, loadMealSuggestion]);

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

  const consumedCalories = Math.round(totals.calories);
  const targetCalories = Math.round(targets.calories);
  const remaining = Math.round(targets.calories - totals.calories);
  const isOverTarget = remaining < 0;
  const goalState =
    isOverTarget ? '已超出目标' : remaining < targets.calories * 0.18 ? '接近目标' : '节奏正常';

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>{formatChineseDate(dateKey)}</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, isOverTarget && styles.statusDotOver]} />
            <Text style={styles.statusText}>{refreshing ? '同步中' : goalState}</Text>
          </View>
        </View>
      </View>

      <View style={styles.dashboard}>
        <View
          pointerEvents="none"
          style={[styles.dashboardAccent, isOverTarget && styles.dashboardAccentOver]}
        />
        <View style={styles.hero}>
          <View style={styles.calorieBlock}>
            <Text style={styles.calorieLabel}>已摄入</Text>
            <View style={styles.calorieRow}>
              <Text style={styles.calorieValue}>{consumedCalories}</Text>
              <Text style={styles.calorieUnit}>kcal</Text>
            </View>
          </View>
          <View style={styles.calorieStats}>
            <CalorieMiniStat
              label={isOverTarget ? '超出' : '剩余'}
              value={Math.abs(remaining)}
              tone={isOverTarget ? 'over' : 'primary'}
            />
            <CalorieMiniStat label="目标" value={targetCalories} tone="muted" />
          </View>
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

      {mealSuggestion ? <MealSuggestionCard state={mealSuggestion} /> : null}

      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>今日餐食</Text>
          <Text style={styles.mealCount}>{meals.length}</Text>
        </View>
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
            <Card variant="base" style={styles.mealCard}>
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
                      {getMealDisplayTitle(meal)}
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

function MealSuggestionCard({ state }: { state: MealSuggestionState }) {
  const statusLabel = state.loading
    ? '正在生成'
    : state.source === 'ai'
      ? 'AI 生成'
      : '本地兜底';
  const statusTone = state.loading ? 'loading' : state.source === 'ai' ? 'ai' : 'fallback';
  const warnings = [
    ...(state.message ? [state.message] : []),
    ...state.advice.warnings,
  ].slice(0, 2);

  return (
    <Card variant="base" style={styles.dinnerCard}>
      <View style={styles.dinnerTop}>
        <View style={styles.dinnerHeading}>
          <View style={styles.dinnerIcon}>
            <Ionicons name="sparkles-outline" size={17} color={theme.colors.primary} />
          </View>
          <View style={styles.dinnerTitleGroup}>
            <Text style={styles.dinnerEyebrow}>
              {state.scope === 'full_day' ? `${state.mealLabel}助手` : `${state.mealLabel}额度助手`}
            </Text>
            <Text style={styles.dinnerTitle}>{state.advice.title}</Text>
          </View>
        </View>
        <View
          style={[
            styles.dinnerStatus,
            statusTone === 'ai' && styles.dinnerStatusAi,
            statusTone === 'fallback' && styles.dinnerStatusFallback,
          ]}
        >
          {state.loading ? (
            <ActivityIndicator color={theme.colors.primary} size="small" />
          ) : null}
          <Text
            style={[
              styles.dinnerStatusText,
              statusTone === 'fallback' && styles.dinnerStatusTextFallback,
            ]}
          >
            {statusLabel}
          </Text>
        </View>
      </View>

      <View style={styles.remainingGrid}>
        <RemainingPill label="热量" value={state.remaining.calories} unit="kcal" />
        <RemainingPill label="蛋白" value={state.remaining.protein} unit="g" />
        <RemainingPill label="碳水" value={state.remaining.carbs} unit="g" />
        <RemainingPill label="脂肪" value={state.remaining.fat} unit="g" />
      </View>

      <Text style={styles.dinnerSummary}>{state.advice.summary}</Text>

      <View style={styles.comboList}>
        {state.advice.combo.map((food, index) => (
          <MealFoodRow key={`${food.foodId ?? food.name}-${index}`} food={food} index={index} />
        ))}
      </View>

      {state.advice.alternatives.length > 0 ? (
        <View style={styles.alternativeWrap}>
          <Text style={styles.alternativeLabel}>可替换</Text>
          <View style={styles.alternativeList}>
            {state.advice.alternatives.map((food, index) => (
              <View key={`${food.foodId ?? food.name}-${index}`} style={styles.alternativePill}>
                <Text style={styles.alternativeName} numberOfLines={1}>{food.name}</Text>
                <Text style={styles.alternativeMeta}>{formatServing(food)}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {warnings.map((warning) => (
        <View key={warning} style={styles.dinnerWarning}>
          <Ionicons name="alert-circle" size={14} color={theme.colors.warning} />
          <Text style={styles.dinnerWarningText}>{warning}</Text>
        </View>
      ))}

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/(tabs)/record')}
        style={({ pressed }) => [styles.recordDinnerButton, pressed && styles.pressed]}
      >
        <Ionicons name="add-circle" size={19} color="#FFFFFF" />
        <Text style={styles.recordDinnerText}>
          {state.scope === 'full_day' ? '记录下一餐' : `记录${state.mealLabel}`}
        </Text>
      </Pressable>
    </Card>
  );
}

function buildMealSuggestionLoadingMessage(scope: MealSuggestionScope, mealLabel: string): string {
  return scope === 'full_day'
    ? '正在让 AI 规划明日整天。'
    : `正在让 AI 按剩余额度配${mealLabel}。`;
}

function RemainingPill({ label, value, unit }: { label: string; value: number; unit: string }) {
  const over = value < 0;
  return (
    <View style={[styles.remainingPill, over && styles.remainingPillOver]}>
      <Text style={[styles.remainingLabel, over && styles.remainingLabelOver]}>{label}</Text>
      <Text style={[styles.remainingValue, over && styles.remainingValueOver]} numberOfLines={1}>
        {over ? `超${Math.abs(Math.round(value))}` : Math.round(value)}
      </Text>
      <Text style={[styles.remainingUnit, over && styles.remainingUnitOver]}>{unit}</Text>
    </View>
  );
}

function MealFoodRow({ food, index }: { food: MealSuggestionFood; index: number }) {
  return (
    <View style={styles.comboRow}>
      <View style={styles.comboIndex}>
        <Text style={styles.comboIndexText}>{index + 1}</Text>
      </View>
      <View style={styles.comboCopy}>
        <Text style={styles.comboName} numberOfLines={1}>{food.name}</Text>
        <Text style={styles.comboReason} numberOfLines={2}>
          {[formatServing(food), food.reason].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {food.calories > 0 ? (
        <View style={styles.comboCalories}>
          <Text style={styles.comboCaloriesValue}>{Math.round(food.calories)}</Text>
          <Text style={styles.comboCaloriesUnit}>kcal</Text>
        </View>
      ) : null}
    </View>
  );
}

function formatServing(food: MealSuggestionFood): string {
  return food.servingGrams ? `${Math.round(food.servingGrams)}g` : '';
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
      <Text style={styles.macroLimit}>上限 {Math.round(target)}g</Text>
      <View style={styles.macroTrack}>
        <View style={[styles.macroFill, { backgroundColor: color, width: `${progress * 100}%` }]} />
      </View>
    </View>
  );
}

function CalorieMiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'primary' | 'over' | 'muted';
}) {
  const isOver = tone === 'over';
  const isPrimary = tone === 'primary';

  return (
    <View
      accessibilityLabel={`${label} ${Math.round(value)} 千卡`}
      style={[
        styles.calorieMiniStat,
        isPrimary && styles.calorieMiniStatPrimary,
        isOver && styles.calorieMiniStatOver,
      ]}
    >
      <Text
        style={[
          styles.calorieMiniLabel,
          isPrimary && styles.calorieMiniLabelPrimary,
          isOver && styles.calorieMiniLabelOver,
        ]}
      >
        {label}
      </Text>
      <View style={styles.calorieMiniRow}>
        <Text
          style={[
            styles.calorieMiniValue,
            isPrimary && styles.calorieMiniValuePrimary,
            isOver && styles.calorieMiniValueOver,
          ]}
        >
          {Math.round(value)}
        </Text>
        <Text style={[styles.calorieMiniUnit, isOver && styles.calorieMiniUnitOver]}>kcal</Text>
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
  pressed: {
    opacity: 0.72,
  },
  dashboard: {
    backgroundColor: theme.colors.surfaceRaised,
    borderWidth: 1,
    borderColor: '#FFFFFF',
    borderRadius: 24,
    borderCurve: 'continuous',
    padding: 20,
    paddingRight: 22,
    gap: 18,
    overflow: 'hidden',
    boxShadow: theme.shadows.large,
  },
  dashboardAccent: {
    position: 'absolute',
    top: 118,
    right: -2,
    width: 5,
    height: 58,
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6,
    backgroundColor: theme.colors.primary,
    opacity: 0.9,
    zIndex: 0,
  },
  dashboardAccentOver: {
    backgroundColor: theme.colors.accent,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    zIndex: 1,
  },
  calorieBlock: {
    flex: 1,
    minWidth: 0,
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
    fontSize: 50,
    lineHeight: 56,
    fontWeight: '900',
    letterSpacing: 0,
    fontVariant: ['tabular-nums'],
  },
  calorieUnit: {
    color: theme.colors.textFaint,
    fontSize: 12,
    fontWeight: '800',
    paddingBottom: 11,
  },
  calorieStats: {
    width: 104,
    flexShrink: 0,
    gap: 8,
  },
  calorieMiniStat: {
    minHeight: 45,
    borderRadius: 14,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: theme.colors.surfaceInset,
    paddingHorizontal: 10,
    paddingVertical: 7,
    justifyContent: 'center',
    gap: 2,
  },
  calorieMiniStatPrimary: {
    borderColor: 'rgba(39, 93, 255, 0.18)',
    backgroundColor: theme.colors.primaryWash,
  },
  calorieMiniStatOver: {
    borderColor: 'rgba(255, 90, 61, 0.24)',
    backgroundColor: theme.colors.accentWash,
  },
  calorieMiniLabel: {
    color: theme.colors.textMuted,
    fontSize: 9,
    fontWeight: '900',
  },
  calorieMiniLabelPrimary: {
    color: theme.colors.primary,
  },
  calorieMiniLabelOver: {
    color: theme.colors.accent,
  },
  calorieMiniRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  calorieMiniValue: {
    color: theme.colors.text,
    fontSize: 18,
    lineHeight: 20,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  calorieMiniValuePrimary: {
    color: theme.colors.primary,
  },
  calorieMiniValueOver: {
    color: theme.colors.accent,
  },
  calorieMiniUnit: {
    color: theme.colors.textFaint,
    fontSize: 8,
    fontWeight: '900',
    paddingBottom: 2,
  },
  calorieMiniUnitOver: {
    color: theme.colors.accent,
  },
  macroGrid: {
    flexDirection: 'row',
    gap: 8,
    zIndex: 1,
  },
  macroTile: {
    flex: 1,
    minWidth: 0,
    padding: 12,
    borderRadius: 13,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: theme.colors.surfaceInset,
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
  macroLimit: {
    color: theme.colors.textMuted,
    fontSize: 9,
    fontWeight: '800',
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
  dinnerCard: {
    gap: 13,
    borderColor: '#FFFFFF',
    overflow: 'hidden',
  },
  dinnerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  dinnerHeading: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dinnerIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dinnerTitleGroup: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  dinnerEyebrow: {
    color: theme.colors.primary,
    fontSize: 11,
    fontWeight: '900',
  },
  dinnerTitle: {
    color: theme.colors.text,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '900',
  },
  dinnerStatus: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 15,
    paddingHorizontal: 10,
    backgroundColor: theme.colors.primaryWash,
    borderWidth: 1,
    borderColor: 'rgba(39, 93, 255, 0.12)',
  },
  dinnerStatusAi: {
    backgroundColor: theme.colors.successSoft,
    borderColor: 'rgba(24, 134, 91, 0.16)',
  },
  dinnerStatusFallback: {
    backgroundColor: theme.colors.warningSoft,
    borderColor: 'rgba(161, 92, 0, 0.15)',
  },
  dinnerStatusText: {
    color: theme.colors.primary,
    fontSize: 10,
    fontWeight: '900',
  },
  dinnerStatusTextFallback: {
    color: theme.colors.warning,
  },
  remainingGrid: {
    flexDirection: 'row',
    gap: 7,
  },
  remainingPill: {
    flex: 1,
    minWidth: 0,
    minHeight: 58,
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: theme.colors.surfaceInset,
    paddingVertical: 8,
    paddingHorizontal: 8,
    justifyContent: 'center',
    gap: 2,
  },
  remainingPillOver: {
    backgroundColor: theme.colors.accentWash,
    borderColor: 'rgba(255, 90, 61, 0.18)',
  },
  remainingLabel: {
    color: theme.colors.textMuted,
    fontSize: 9,
    fontWeight: '900',
  },
  remainingLabelOver: {
    color: theme.colors.accent,
  },
  remainingValue: {
    color: theme.colors.text,
    fontSize: 17,
    lineHeight: 19,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  remainingValueOver: {
    color: theme.colors.accent,
    fontSize: 15,
  },
  remainingUnit: {
    color: theme.colors.textFaint,
    fontSize: 8,
    fontWeight: '900',
  },
  remainingUnitOver: {
    color: theme.colors.accent,
  },
  dinnerSummary: {
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
  },
  comboList: {
    gap: 8,
  },
  comboRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSoft,
    paddingTop: 8,
  },
  comboIndex: {
    width: 26,
    height: 26,
    borderRadius: 9,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.surfaceTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  comboIndexText: {
    color: theme.colors.primary,
    fontSize: 11,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  comboCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  comboName: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  comboReason: {
    color: theme.colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  comboCalories: {
    alignItems: 'flex-end',
    minWidth: 46,
  },
  comboCaloriesValue: {
    color: theme.colors.text,
    fontSize: 17,
    lineHeight: 19,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  comboCaloriesUnit: {
    color: theme.colors.textFaint,
    fontSize: 8,
    fontWeight: '800',
  },
  alternativeWrap: {
    gap: 8,
  },
  alternativeLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '900',
  },
  alternativeList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  alternativePill: {
    maxWidth: '100%',
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: theme.colors.surfaceInset,
    paddingHorizontal: 10,
  },
  alternativeName: {
    maxWidth: 180,
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '900',
  },
  alternativeMeta: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  dinnerWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.warningSoft,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  dinnerWarningText: {
    flex: 1,
    color: theme.colors.warning,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
  },
  recordDinnerButton: {
    minHeight: 44,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    boxShadow: theme.shadows.primary,
  },
  recordDinnerText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
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
    backgroundColor: theme.colors.surfaceInset,
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
    backgroundColor: theme.colors.surfaceTint,
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
