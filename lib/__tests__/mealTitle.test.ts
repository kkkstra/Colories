import { describe, expect, it } from 'vitest';

import { createMealTitle, getMealDisplayTitle, normalizeMealTitle } from '@/lib/mealTitle';

describe('meal title helpers', () => {
  it('normalizes AI meal titles', () => {
    expect(normalizeMealTitle('  香煎鸡胸肉  ')).toBe('香煎鸡胸肉');
    expect(normalizeMealTitle('，咖啡和贝果。')).toBe('咖啡和贝果');
  });

  it('creates a compact fallback from meal items', () => {
    expect(
      createMealTitle([
        {
          id: '1',
          name: '鸡腿饭',
          weightGrams: 300,
          calories: 600,
          protein: 24,
          carbs: 78,
          fat: 18,
          source: 'manual',
        },
        {
          id: '2',
          name: '青菜',
          weightGrams: 120,
          calories: 40,
          protein: 2,
          carbs: 6,
          fat: 1,
          source: 'manual',
        },
      ]),
    ).toBe('鸡腿饭、青菜');
  });

  it('prefers saved titles when displaying meals', () => {
    expect(
      getMealDisplayTitle({
        title: '咖啡和贝果',
        items: [],
      }),
    ).toBe('咖啡和贝果');
  });
});
