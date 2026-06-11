import { describe, expect, it } from 'vitest';

import {
  applyRecognitionChoice,
  createCustomFoodInputFromMealItem,
  createMealItemDraftFromRecognition,
} from '@/lib/mealItemDrafts';
import type { AIRecognizedFood } from '@/types/domain';

const recognizedFood: AIRecognizedFood = {
  name: '牛肉盖浇饭',
  estimatedWeightGrams: 250,
  cookingMethod: '盖饭',
  confidence: 0.76,
  nutrition: {
    calories: 520,
    protein: 22,
    carbs: 68,
    fat: 18,
  },
};

describe('meal item draft helpers', () => {
  it('keeps both AI and catalog choices for fuzzy catalog matches', () => {
    const draft = createMealItemDraftFromRecognition(recognizedFood, {
      id: 'beef-rice',
      nameZh: '牛肉饭',
      calories: 190,
      protein: 10.5,
      carbs: 22,
      fat: 6.8,
      matchKind: 'fuzzy',
    });

    expect(draft.source).toBe('catalog');
    expect(draft.name).toBe('牛肉饭');
    expect(draft.calories).toBe(475);
    expect(draft.recognitionAlternatives?.selected).toBe('catalog');
    expect(draft.recognitionAlternatives?.ai.name).toBe('牛肉盖浇饭');

    const aiDraft = applyRecognitionChoice(draft, 'ai');
    expect(aiDraft.source).toBe('ai');
    expect(aiDraft.name).toBe('牛肉盖浇饭');
    expect(aiDraft.calories).toBe(520);
    expect(aiDraft.recognitionAlternatives?.selected).toBe('ai');

    const input = createCustomFoodInputFromMealItem(aiDraft);
    expect(input.aliases).toEqual(['牛肉盖浇饭']);
  });

  it('does not add a choice panel for exact catalog matches', () => {
    const draft = createMealItemDraftFromRecognition(recognizedFood, {
      id: 'beef-rice',
      nameZh: '牛肉盖浇饭',
      calories: 208,
      protein: 8.8,
      carbs: 27.2,
      fat: 7.2,
      matchKind: 'exact',
    });

    expect(draft.source).toBe('catalog');
    expect(draft.recognitionAlternatives).toBeUndefined();
  });

  it('converts a meal item back to per-100g values for quick catalog saving', () => {
    const draft = createMealItemDraftFromRecognition(recognizedFood);
    const input = createCustomFoodInputFromMealItem(draft);

    expect(input.nameZh).toBe('牛肉盖浇饭');
    expect(input.category).toBe('dish');
    expect(input.calories).toBe(208);
    expect(input.protein).toBe(8.8);
    expect(input.carbs).toBe(27.2);
    expect(input.fat).toBe(7.2);
    expect(input.sourceReference).toContain('AI 图像识别估算');
  });
});
