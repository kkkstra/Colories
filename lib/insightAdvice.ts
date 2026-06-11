import type { DailyTargets, MacroValues } from '@/types/domain';

export const INSIGHT_ADVICE_CACHE_ID = 'weekly';

const INSIGHT_ADVICE_DATA_VERSION = 2;

type InsightAdviceDay = MacroValues & { dateKey: string };

export interface InsightAdviceData {
  periodDays: number;
  recordedDays: InsightAdviceDay[];
  missingDays: number;
}

export function buildInsightAdviceData(
  days: readonly InsightAdviceDay[],
  periodDays = days.length,
): InsightAdviceData {
  const recordedDays = days.filter(hasNutritionData);
  return {
    periodDays,
    recordedDays,
    missingDays: Math.max(0, periodDays - recordedDays.length),
  };
}

export function buildInsightAdviceDataHash(
  days: readonly InsightAdviceDay[],
  targets: DailyTargets,
  periodDays = days.length,
): string {
  const adviceData = buildInsightAdviceData(days, periodDays);
  const payload = {
    version: INSIGHT_ADVICE_DATA_VERSION,
    periodDays: adviceData.periodDays,
    recordedDays: adviceData.recordedDays.length,
    missingDays: adviceData.missingDays,
    targets: normalizeMacros(targets),
    days: adviceData.recordedDays.map((day) => ({
      dateKey: day.dateKey,
      ...normalizeMacros(day),
    })),
  };
  return `v${INSIGHT_ADVICE_DATA_VERSION}-${hashString(JSON.stringify(payload))}`;
}

function hasNutritionData(day: MacroValues): boolean {
  return day.calories > 0 || day.protein > 0 || day.carbs > 0 || day.fat > 0;
}

function normalizeMacros(values: MacroValues): MacroValues {
  return {
    calories: round(values.calories),
    protein: round(values.protein),
    carbs: round(values.carbs),
    fat: round(values.fat),
  };
}

function round(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : 0;
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
