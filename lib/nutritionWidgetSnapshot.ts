import { toLocalDateKey } from '@/lib/date';
import type { DaySummary } from '@/lib/database';
import { clampNumber } from '@/lib/nutrition';
import type { DailyTargets, NutritionWidgetSnapshot } from '@/types/domain';

const EMPTY_TARGETS: DailyTargets = {
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
};

const EMPTY_TOTALS: DaySummary = {
  dateKey: toLocalDateKey(),
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
};

export function createNutritionWidgetSnapshot({
  totals,
  targets,
  now = new Date(),
}: {
  totals?: DaySummary | null;
  targets?: DailyTargets | null;
  now?: Date;
}): NutritionWidgetSnapshot {
  const nextTotals = totals ?? EMPTY_TOTALS;
  const nextTargets = targets ?? EMPTY_TARGETS;
  const remainingCalories = Math.round(nextTargets.calories - nextTotals.calories);
  const calorieProgress = progressRatio(nextTotals.calories, nextTargets.calories);
  const statusLabel =
    !targets
      ? '未设置目标'
      : remainingCalories < 0
        ? '已超出目标'
        : remainingCalories < nextTargets.calories * 0.18
          ? '接近目标'
          : '节奏正常';

  return {
    dateKey: nextTotals.dateKey,
    consumedCalories: Math.round(nextTotals.calories),
    targetCalories: Math.round(nextTargets.calories),
    remainingCalories,
    calorieProgress,
    protein: Math.round(nextTotals.protein),
    proteinTarget: Math.round(nextTargets.protein),
    proteinProgress: progressRatio(nextTotals.protein, nextTargets.protein),
    carbs: Math.round(nextTotals.carbs),
    carbsTarget: Math.round(nextTargets.carbs),
    carbsProgress: progressRatio(nextTotals.carbs, nextTargets.carbs),
    fat: Math.round(nextTotals.fat),
    fatTarget: Math.round(nextTargets.fat),
    fatProgress: progressRatio(nextTotals.fat, nextTargets.fat),
    statusLabel,
    updatedAtLabel: formatWidgetTime(now),
    hasTargets: Boolean(targets),
  };
}

function progressRatio(value: number, target: number): number {
  if (target <= 0) {
    return 0;
  }
  return clampNumber(value / target, 0, 0, 1.25);
}

function formatWidgetTime(date: Date): string {
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}
