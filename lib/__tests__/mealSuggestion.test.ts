import { describe, expect, it, vi } from 'vitest';

import {
  buildMealSuggestionData,
  buildMealSuggestionDataHash,
  buildFallbackMealSuggestion,
  resolveMealSuggestionAdvice,
  selectMealSuggestionCandidates,
} from '@/lib/mealSuggestion';
import type { DailyTargets, MealSuggestionAdvice, FoodCatalogItem, MacroValues } from '@/types/domain';

const targets: DailyTargets = {
  calories: 2000,
  protein: 120,
  carbs: 230,
  fat: 60,
};

const totals: MacroValues = {
  calories: 1430,
  protein: 72,
  carbs: 170,
  fat: 48,
};

const foods: FoodCatalogItem[] = [
  {
    id: 'chicken',
    nameZh: '鸡胸肉',
    nameEn: 'Chicken breast',
    category: 'protein',
    calories: 165,
    protein: 31,
    carbs: 0,
    fat: 3.6,
    aliases: [],
    sourceReference: 'test source',
  },
  {
    id: 'pork-belly',
    nameZh: '五花肉',
    nameEn: 'Pork belly',
    category: 'protein',
    calories: 518,
    protein: 9.3,
    carbs: 0,
    fat: 53,
    aliases: [],
    sourceReference: 'test source',
  },
  {
    id: 'rice',
    nameZh: '白米饭',
    nameEn: 'Rice',
    category: 'staple',
    calories: 130,
    protein: 2.7,
    carbs: 28.2,
    fat: 0.3,
    aliases: [],
    sourceReference: 'test source',
  },
  {
    id: 'broccoli',
    nameZh: '西兰花',
    nameEn: 'Broccoli',
    category: 'vegetable',
    calories: 35,
    protein: 2.4,
    carbs: 7.2,
    fat: 0.4,
    aliases: [],
    sourceReference: 'test source',
  },
  {
    id: 'soy-sauce',
    nameZh: '酱油',
    nameEn: 'Soy sauce',
    category: 'condiment',
    calories: 53,
    protein: 8.1,
    carbs: 4.9,
    fat: 0.6,
    aliases: [],
    sourceReference: 'test source',
  },
];

describe('meal suggestion planning', () => {
  it('selects compact meal candidates without sending the whole catalog shape', () => {
    const candidates = selectMealSuggestionCandidates(foods, {
      calories: 570,
      protein: 48,
      carbs: 60,
      fat: 12,
    });

    expect(candidates.map((candidate) => candidate.id)).toContain('chicken');
    expect(candidates.map((candidate) => candidate.id)).toContain('broccoli');
    expect(candidates.map((candidate) => candidate.id)).not.toContain('soy-sauce');
    expect(candidates.length).toBeLessThanOrEqual(24);
    expect(candidates[0]).toMatchObject({ servingGrams: 120 });
  });

  it('keeps data hash stable for tiny edits and changes for meaningful edits', () => {
    const candidates = selectMealSuggestionCandidates(foods, { calories: 570, protein: 48, carbs: 60, fat: 12 });
    const base = buildMealSuggestionDataHash({
      dateKey: '2026-06-12',
      targetType: 'lunch',
      scope: 'meal',
      totals,
      targets,
      candidates,
      model: 'chat-model',
    });
    const tinyEdit = buildMealSuggestionDataHash({
      dateKey: '2026-06-12',
      targetType: 'lunch',
      scope: 'meal',
      totals: { ...totals, calories: totals.calories + 18 },
      targets,
      candidates,
      model: 'chat-model',
    });
    const meaningfulEdit = buildMealSuggestionDataHash({
      dateKey: '2026-06-12',
      targetType: 'lunch',
      scope: 'meal',
      totals: { ...totals, calories: totals.calories + 120 },
      targets,
      candidates,
      model: 'chat-model',
    });
    const mealChange = buildMealSuggestionDataHash({
      dateKey: '2026-06-12',
      targetType: 'dinner',
      scope: 'meal',
      totals,
      targets,
      candidates,
      model: 'chat-model',
    });

    expect(tinyEdit).toBe(base);
    expect(meaningfulEdit).not.toBe(base);
    expect(mealChange).not.toBe(base);
  });

  it('builds a useful fallback suggestion when AI is unavailable', () => {
    const data = buildMealSuggestionData({
      dateKey: '2026-06-12',
      targetType: 'lunch',
      scope: 'meal',
      totals,
      targets,
      foods,
      providerConfig: { model: 'chat-model' },
    });
    const fallback = buildFallbackMealSuggestion(data);

    expect(fallback.combo.some((food) => food.name.includes('鸡胸肉'))).toBe(true);
    expect(fallback.combo.some((food) => food.name.includes('西兰花'))).toBe(true);
    expect(fallback.title).toContain('午餐');
    expect(fallback.warnings[0]).toContain('AI');
  });

  it('uses cached advice without generating again', async () => {
    const cached: MealSuggestionAdvice & { dataHash: string } = {
      dataHash: 'same-hash',
      title: '缓存午餐',
      summary: '沿用上一条建议。',
      combo: [{ name: '鸡胸肉', servingGrams: 120, calories: 198, protein: 37.2, carbs: 0, fat: 4.3 }],
      alternatives: [],
      warnings: [],
    };
    const generate = vi.fn<() => Promise<MealSuggestionAdvice>>();

    const resolved = await resolveMealSuggestionAdvice({
      dataHash: 'same-hash',
      cached,
      fallback: cached,
      canGenerate: true,
      generate,
      save: async (advice) => advice,
    });

    expect(resolved.source).toBe('cache');
    expect(resolved.advice.title).toBe('缓存午餐');
    expect(generate).not.toHaveBeenCalled();
  });

  it('falls back without AI when there is no recorded nutrition yet', () => {
    const data = buildMealSuggestionData({
      dateKey: '2026-06-12',
      targetType: 'breakfast',
      scope: 'meal',
      totals: { calories: 0, protein: 0, carbs: 0, fat: 0 },
      targets,
      foods: [],
      providerConfig: null,
    });
    const fallback = buildFallbackMealSuggestion(data);

    expect(data.hasNutritionData).toBe(false);
    expect(fallback.title).toContain('记录');
    expect(fallback.combo.length).toBeGreaterThan(0);
  });

  it('plans a full next day without depending on today totals', () => {
    const data = buildMealSuggestionData({
      dateKey: '2026-06-13',
      targetType: 'full_day',
      scope: 'full_day',
      totals,
      targets,
      foods,
      providerConfig: { model: 'chat-model' },
    });
    const sameTarget = buildMealSuggestionDataHash({
      dateKey: '2026-06-13',
      targetType: 'full_day',
      scope: 'full_day',
      totals: { ...totals, calories: totals.calories + 400 },
      targets,
      candidates: data.candidates,
      model: 'chat-model',
    });

    expect(data.mealLabel).toBe('明日整天');
    expect(data.remaining.calories).toBe(targets.calories);
    expect(data.hasNutritionData).toBe(true);
    expect(sameTarget).toBe(data.dataHash);
    expect(buildFallbackMealSuggestion(data).title).toContain('明天');
  });
});
