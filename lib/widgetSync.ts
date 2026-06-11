import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';

import { toLocalDateKey } from '@/lib/date';
import { getDayTotals, getTargets } from '@/lib/database';
import { createNutritionWidgetSnapshot } from '@/lib/nutritionWidgetSnapshot';

export async function syncTodayNutritionWidget(db: SQLiteDatabase): Promise<void> {
  const iosWidgetsEnabled = Constants.expoConfig?.extra?.iosWidgetsEnabled === true;

  if (Platform.OS !== 'ios' || !iosWidgetsEnabled) {
    return;
  }

  try {
    const { default: TodayNutritionWidget } = await import('@/widgets/today-nutrition-widget');
    const dateKey = toLocalDateKey();
    const [targets, totals] = await Promise.all([
      getTargets(db, dateKey),
      getDayTotals(db, dateKey),
    ]);
    TodayNutritionWidget.updateSnapshot(
      createNutritionWidgetSnapshot({
        totals,
        targets,
      }),
    );
  } catch {
    // Widgets should never block saving or editing a meal.
  }
}
