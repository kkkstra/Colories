import { describe, expect, it } from 'vitest';

import { createNutritionWidgetSnapshot } from '@/lib/nutritionWidgetSnapshot';

const now = new Date('2026-06-11T07:35:00+08:00');

describe('nutrition widget snapshot', () => {
  it('summarizes remaining calories and macro progress', () => {
    const snapshot = createNutritionWidgetSnapshot({
      now,
      totals: {
        dateKey: '2026-06-11',
        calories: 1450,
        protein: 80,
        carbs: 160,
        fat: 45,
      },
      targets: {
        calories: 2200,
        protein: 120,
        carbs: 260,
        fat: 70,
      },
    });

    expect(snapshot).toMatchObject({
      dateKey: '2026-06-11',
      consumedCalories: 1450,
      targetCalories: 2200,
      remainingCalories: 750,
      proteinProgress: 80 / 120,
      statusLabel: '节奏正常',
      hasTargets: true,
    });
  });

  it('marks over-target days clearly', () => {
    const snapshot = createNutritionWidgetSnapshot({
      now,
      totals: {
        dateKey: '2026-06-11',
        calories: 2500,
        protein: 130,
        carbs: 280,
        fat: 80,
      },
      targets: {
        calories: 2200,
        protein: 120,
        carbs: 260,
        fat: 70,
      },
    });

    expect(snapshot.remainingCalories).toBe(-300);
    expect(snapshot.calorieProgress).toBe(2500 / 2200);
    expect(snapshot.statusLabel).toBe('已超出目标');
  });

  it('keeps a usable empty state when targets are missing', () => {
    const snapshot = createNutritionWidgetSnapshot({
      now,
      totals: {
        dateKey: '2026-06-11',
        calories: 320,
        protein: 18,
        carbs: 40,
        fat: 9,
      },
      targets: null,
    });

    expect(snapshot.hasTargets).toBe(false);
    expect(snapshot.statusLabel).toBe('未设置目标');
    expect(snapshot.targetCalories).toBe(0);
    expect(snapshot.calorieProgress).toBe(0);
  });
});
