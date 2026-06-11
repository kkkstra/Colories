import type { FoodCatalogInput, FoodMatch } from '@/lib/database';
import { round, scaleNutrition } from '@/lib/nutrition';
import { createLocalId } from '@/lib/security';
import type {
  AIRecognizedFood,
  MacroValues,
  MealItemDraft,
  MealItemRecognitionChoice,
  MealItemRecognitionOption,
} from '@/types/domain';

type CatalogMatch = Pick<
  FoodMatch,
  'id' | 'nameZh' | 'calories' | 'protein' | 'carbs' | 'fat' | 'matchKind'
>;

export function createMealItemDraftFromRecognition(
  food: AIRecognizedFood,
  match?: CatalogMatch | null,
): MealItemDraft {
  const base = {
    id: createLocalId('food'),
    weightGrams: food.estimatedWeightGrams,
    confidence: food.confidence,
    cookingMethod: food.cookingMethod,
  };

  if (!match) {
    return {
      ...base,
      name: food.name,
      ...food.nutrition,
      source: 'ai',
      warning: food.warning,
    };
  }

  const catalogOption: MealItemRecognitionOption = {
    name: match.nameZh,
    source: 'catalog',
    catalogFoodId: match.id,
    ...scaleNutrition(match, food.estimatedWeightGrams),
    warning:
      match.matchKind === 'fuzzy'
        ? `AI 识别为“${food.name}”，食物库匹配到“${match.nameZh}”。请选择使用哪一组数据。`
        : food.warning,
  };
  const aiOption: MealItemRecognitionOption = {
    name: food.name,
    source: 'ai',
    ...food.nutrition,
    warning: food.warning,
  };

  const shouldOfferChoice = match.matchKind === 'fuzzy';
  return {
    ...base,
    name: catalogOption.name,
    calories: catalogOption.calories,
    protein: catalogOption.protein,
    carbs: catalogOption.carbs,
    fat: catalogOption.fat,
    source: 'catalog',
    catalogFoodId: catalogOption.catalogFoodId,
    warning: catalogOption.warning,
    recognitionAlternatives: shouldOfferChoice
      ? {
          selected: 'catalog',
          ai: aiOption,
          catalog: catalogOption,
        }
      : undefined,
  };
}

export function applyRecognitionChoice(
  item: MealItemDraft,
  choice: MealItemRecognitionChoice,
): MealItemDraft {
  const alternatives = item.recognitionAlternatives;
  if (!alternatives) {
    return item;
  }

  const option = alternatives[choice];
  return {
    ...item,
    name: option.name,
    calories: option.calories,
    protein: option.protein,
    carbs: option.carbs,
    fat: option.fat,
    source: option.source,
    catalogFoodId: option.catalogFoodId,
    warning: option.warning,
    recognitionAlternatives: {
      ...alternatives,
      selected: choice,
    },
  };
}

export function createCustomFoodInputFromMealItem(item: MealItemDraft): FoodCatalogInput {
  const per100g = toPer100g(item);
  const cookingMethod = item.cookingMethod?.trim();
  return {
    nameZh: item.name.trim(),
    nameEn: undefined,
    category: 'dish',
    cookingMethod: cookingMethod || undefined,
    aliases: item.recognitionAlternatives ? [item.recognitionAlternatives.ai.name] : undefined,
    ...per100g,
    sourceReference: 'AI 图像识别估算；用户快速加入，请按包装营养标签、品牌官网或可信食物成分表校准',
  };
}

function toPer100g(item: MealItemDraft): MacroValues {
  const factor = item.weightGrams > 0 ? 100 / item.weightGrams : 1;
  return {
    calories: round(item.calories * factor, 0),
    protein: round(item.protein * factor, 1),
    carbs: round(item.carbs * factor, 1),
    fat: round(item.fat * factor, 1),
  };
}
