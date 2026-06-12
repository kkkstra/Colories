import { scaleNutrition } from '@/lib/nutrition';
import type {
  AIProviderConfig,
  DailyTargets,
  MealSuggestionAdvice,
  MealSuggestionCandidate,
  MealSuggestionScope,
  MealSuggestionTargetType,
  FoodCategory,
  MacroValues,
} from '@/types/domain';

export const MEAL_SUGGESTION_PROMPT_VERSION = 1;
export const MEAL_SUGGESTION_FOOD_LIMIT = 24;
export const MEAL_SUGGESTION_LABELS: Record<MealSuggestionTargetType, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  full_day: '明日整天',
};

type MealSuggestionFoodInput = MacroValues & {
  id: string;
  nameZh: string;
  category: FoodCategory;
  isCustom?: boolean;
};

export interface MealSuggestionDataInput {
  dateKey: string;
  targetType: MealSuggestionTargetType;
  scope: MealSuggestionScope;
  totals: MacroValues;
  targets: DailyTargets;
  foods: readonly MealSuggestionFoodInput[];
  providerConfig?: Pick<AIProviderConfig, 'model'> | null;
}

export interface MealSuggestionData {
  dateKey: string;
  targetType: MealSuggestionTargetType;
  scope: MealSuggestionScope;
  mealLabel: string;
  totals: MacroValues;
  targets: DailyTargets;
  remaining: MacroValues;
  candidates: MealSuggestionCandidate[];
  dataHash: string;
  hasNutritionData: boolean;
}

export type MealSuggestionSource = 'ai' | 'cache' | 'fallback';

export interface MealSuggestionResolution<TAdvice extends MealSuggestionAdvice = MealSuggestionAdvice> {
  advice: TAdvice;
  source: MealSuggestionSource;
  message?: string;
}

export interface ResolveMealSuggestionOptions<TAdvice extends MealSuggestionAdvice> {
  dataHash: string;
  cached?: (TAdvice & { dataHash: string }) | null;
  fallback: TAdvice;
  canGenerate: boolean;
  generate: () => Promise<TAdvice>;
  save: (advice: TAdvice) => Promise<TAdvice>;
}

const CATEGORY_SERVINGS: Record<FoodCategory, number> = {
  staple: 100,
  protein: 120,
  vegetable: 200,
  fruit: 150,
  dairy: 200,
  snack: 30,
  dish: 250,
  beverage: 250,
  condiment: 10,
};

const CATEGORY_RANKS: Record<FoodCategory, number> = {
  protein: 0,
  vegetable: 1,
  staple: 2,
  dish: 3,
  dairy: 4,
  fruit: 5,
  snack: 6,
  beverage: 7,
  condiment: 8,
};

const RECOMMENDABLE_CATEGORIES = new Set<FoodCategory>([
  'protein',
  'vegetable',
  'staple',
  'dish',
  'dairy',
  'fruit',
]);

export function buildMealSuggestionData(input: MealSuggestionDataInput): MealSuggestionData {
  const remaining = input.scope === 'full_day'
    ? normalizeTargetsAsRemaining(input.targets)
    : subtractMacros(input.targets, input.totals);
  const candidates = selectMealSuggestionCandidates(input.foods, remaining);
  const hasNutritionData = input.scope === 'full_day' || hasAnyNutrition(input.totals);
  const mealLabel = getMealSuggestionLabel(input.targetType);
  return {
    dateKey: input.dateKey,
    targetType: input.targetType,
    scope: input.scope,
    mealLabel,
    totals: input.totals,
    targets: input.targets,
    remaining,
    candidates,
    hasNutritionData,
    dataHash: buildMealSuggestionDataHash({
      dateKey: input.dateKey,
      targetType: input.targetType,
      scope: input.scope,
      totals: input.totals,
      targets: input.targets,
      candidates,
      model: input.providerConfig?.model,
    }),
  };
}

export function buildMealSuggestionDataHash({
  dateKey,
  targetType,
  scope,
  totals,
  targets,
  candidates,
  model,
}: {
  dateKey: string;
  targetType: MealSuggestionTargetType;
  scope: MealSuggestionScope;
  totals: MacroValues;
  targets: MacroValues;
  candidates: readonly MealSuggestionCandidate[];
  model?: string;
}): string {
  const payload = {
    version: MEAL_SUGGESTION_PROMPT_VERSION,
    dateKey,
    targetType,
    scope,
    model: model?.trim() || 'local',
    totals: scope === 'full_day' ? bucketMacros({ calories: 0, protein: 0, carbs: 0, fat: 0 }) : bucketMacros(totals),
    targets: bucketMacros(targets),
    candidates: candidates.map((candidate) => ({
      id: candidate.id,
      category: candidate.category,
      servingGrams: candidate.servingGrams,
      calories: Math.round(candidate.calories / 25) * 25,
      protein: Math.round(candidate.protein),
      carbs: Math.round(candidate.carbs),
      fat: Math.round(candidate.fat),
    })),
  };
  return `meal-v${MEAL_SUGGESTION_PROMPT_VERSION}-${hashString(JSON.stringify(payload))}`;
}

export function getMealSuggestionLabel(targetType: MealSuggestionTargetType): string {
  return MEAL_SUGGESTION_LABELS[targetType];
}

export function selectMealSuggestionCandidates(
  foods: readonly MealSuggestionFoodInput[],
  remaining: MacroValues,
  limit = MEAL_SUGGESTION_FOOD_LIMIT,
): MealSuggestionCandidate[] {
  const byCategory = new Map<FoodCategory, MealSuggestionCandidate[]>();
  for (const food of foods) {
    if (!RECOMMENDABLE_CATEGORIES.has(food.category)) {
      continue;
    }
    const servingGrams = CATEGORY_SERVINGS[food.category];
    const candidate = {
      id: food.id,
      name: food.nameZh,
      category: food.category,
      servingGrams,
      isCustom: food.isCustom,
      ...scaleNutrition(food, servingGrams),
    };
    if (candidate.calories <= 0) {
      continue;
    }
    const current = byCategory.get(food.category) ?? [];
    current.push(candidate);
    byCategory.set(food.category, current);
  }

  const selected: MealSuggestionCandidate[] = [];
  const proteinNeed = remaining.protein > 18;
  const carbNeed = remaining.carbs > 30 && remaining.calories > 260;
  const fatTight = remaining.fat < 12;
  const calorieTight = remaining.calories < 280;

  selected.push(
    ...rankCandidates(byCategory.get('protein') ?? [], remaining, {
      preferProtein: proteinNeed,
      preferCarbs: false,
      fatTight,
      calorieTight,
    }).slice(0, 7),
  );
  selected.push(
    ...rankCandidates(byCategory.get('vegetable') ?? [], remaining, {
      preferProtein: false,
      preferCarbs: false,
      fatTight: true,
      calorieTight,
    }).slice(0, 5),
  );
  selected.push(
    ...rankCandidates(byCategory.get('staple') ?? [], remaining, {
      preferProtein: false,
      preferCarbs: carbNeed,
      fatTight,
      calorieTight,
    }).slice(0, calorieTight ? 2 : 5),
  );
  selected.push(
    ...rankCandidates(byCategory.get('dish') ?? [], remaining, {
      preferProtein: proteinNeed,
      preferCarbs: carbNeed,
      fatTight,
      calorieTight,
    }).slice(0, calorieTight ? 1 : 4),
  );
  selected.push(
    ...rankCandidates(byCategory.get('dairy') ?? [], remaining, {
      preferProtein: proteinNeed,
      preferCarbs: false,
      fatTight,
      calorieTight,
    }).slice(0, 2),
  );
  selected.push(
    ...rankCandidates(byCategory.get('fruit') ?? [], remaining, {
      preferProtein: false,
      preferCarbs: carbNeed,
      fatTight: true,
      calorieTight,
    }).slice(0, 2),
  );

  return uniqueById(selected)
    .sort((left, right) => CATEGORY_RANKS[left.category] - CATEGORY_RANKS[right.category])
    .slice(0, limit);
}

export function buildFallbackMealSuggestion(data: MealSuggestionData): MealSuggestionAdvice {
  if (data.scope === 'full_day') {
    return {
      title: '明天这样安排',
      summary: `明天按约 ${Math.round(data.remaining.calories)} kcal 规划，三餐优先保证蛋白质、主食和蔬菜的节奏。`,
      combo: buildFullDayFallbackCombo(data.candidates, data.remaining),
      alternatives: buildCandidateAlternatives(data.candidates, ['protein', 'staple', 'vegetable', 'dairy', 'fruit']).slice(0, 3),
      warnings: data.candidates.length > 0
        ? ['AI 暂不可用，当前为本地规则建议。']
        : ['食物库暂无可用候选，当前为通用全天建议。'],
    };
  }

  if (!data.hasNutritionData) {
    return {
      title: '先记录一餐',
      summary: `记录今天已吃内容后，${data.mealLabel}建议会更贴合剩余热量和营养素。`,
      combo: buildGenericCombo(data.remaining),
      alternatives: [],
      warnings: ['当前建议未调用 AI，只按目标额度给出轻量参考。'],
    };
  }

  if (data.candidates.length === 0) {
    return {
      title: data.remaining.calories < 0 ? '这餐轻一点' : '按额度配餐',
      summary: buildFallbackSummary(data.remaining, data.mealLabel),
      combo: buildGenericCombo(data.remaining),
      alternatives: [],
      warnings: ['食物库暂无可用候选，建议按实际食材手动记录。'],
    };
  }

  const combo = buildFallbackComboFromCandidates(data.candidates, data.remaining);
  const alternatives = buildCandidateAlternatives(
    data.candidates.filter((candidate) => !combo.some((food) => food.foodId === candidate.id)),
    ['protein', 'vegetable', 'staple', 'dairy', 'fruit'],
  ).slice(0, 3);

  return {
    title: data.remaining.calories < 0 ? '这餐轻一点' : `${data.mealLabel}这样配`,
    summary: buildFallbackSummary(data.remaining, data.mealLabel),
    combo: combo.length ? combo : buildGenericCombo(data.remaining),
    alternatives,
    warnings: ['AI 暂不可用，当前为本地规则建议。'],
  };
}

export function shouldUseCachedMealSuggestion(
  cached: { dataHash: string } | null | undefined,
  dataHash: string,
): boolean {
  return cached?.dataHash === dataHash;
}

export async function resolveMealSuggestionAdvice<TAdvice extends MealSuggestionAdvice>({
  dataHash,
  cached,
  fallback,
  canGenerate,
  generate,
  save,
}: ResolveMealSuggestionOptions<TAdvice>): Promise<MealSuggestionResolution<TAdvice>> {
  if (cached && shouldUseCachedMealSuggestion(cached, dataHash)) {
    return { advice: cached, source: 'cache' };
  }
  if (!canGenerate) {
    return { advice: fallback, source: 'fallback', message: '配置 AI 后会生成更具体的正餐或全天建议。' };
  }
  try {
    const generated = await generate();
    const saved = await save(generated);
    return { advice: saved, source: 'ai' };
  } catch {
    return { advice: fallback, source: 'fallback', message: 'AI 建议暂时没生成，先显示本地建议。' };
  }
}

function rankCandidates(
  candidates: MealSuggestionCandidate[],
  remaining: MacroValues,
  options: {
    preferProtein: boolean;
    preferCarbs: boolean;
    fatTight: boolean;
    calorieTight: boolean;
  },
): MealSuggestionCandidate[] {
  const calorieCeiling = remaining.calories > 0
    ? remaining.calories + (options.calorieTight ? 90 : 180)
    : 230;
  return [...candidates]
    .filter((candidate) => candidate.calories <= calorieCeiling || candidate.category === 'vegetable')
    .sort((left, right) => scoreCandidate(right, remaining, options) - scoreCandidate(left, remaining, options));
}

function scoreCandidate(
  candidate: MealSuggestionCandidate,
  remaining: MacroValues,
  options: {
    preferProtein: boolean;
    preferCarbs: boolean;
    fatTight: boolean;
    calorieTight: boolean;
  },
): number {
  let score = candidate.isCustom ? 8 : 0;
  score += Math.max(0, 160 - Math.abs(candidate.calories - Math.max(160, remaining.calories / 3))) / 8;
  if (options.preferProtein) {
    score += candidate.protein * 2.4;
  }
  if (options.preferCarbs) {
    score += candidate.carbs * 1.3;
  }
  if (candidate.category === 'vegetable') {
    score += 24;
  }
  if (options.fatTight) {
    score -= candidate.fat * 4.2;
  } else {
    score -= candidate.fat * 1.2;
  }
  if (options.calorieTight) {
    score -= candidate.calories / 18;
  }
  return score;
}

function buildFallbackComboFromCandidates(
  candidates: MealSuggestionCandidate[],
  remaining: MacroValues,
): MealSuggestionAdvice['combo'] {
  const combo: MealSuggestionAdvice['combo'] = [];
  const protein = candidates.find((candidate) => candidate.category === 'protein');
  const vegetable = candidates.find((candidate) => candidate.category === 'vegetable');
  const staple = remaining.calories > 260 && remaining.carbs > 18
    ? candidates.find((candidate) => candidate.category === 'staple')
    : undefined;
  const dish = !protein && remaining.calories > 380
    ? candidates.find((candidate) => candidate.category === 'dish')
    : undefined;

  for (const candidate of [protein, vegetable, staple, dish]) {
    if (candidate) {
      combo.push(candidateToAdviceFood(candidate, reasonForCandidate(candidate, remaining)));
    }
  }
  return combo;
}

function buildFullDayFallbackCombo(
  candidates: MealSuggestionCandidate[],
  targets: MacroValues,
): MealSuggestionAdvice['combo'] {
  const staple = candidates.find((candidate) => candidate.category === 'staple');
  const protein = candidates.find((candidate) => candidate.category === 'protein');
  const vegetable = candidates.find((candidate) => candidate.category === 'vegetable');
  const combo = [
    protein ? candidateToAdviceFood(protein, '三餐都安排稳定蛋白') : undefined,
    staple ? candidateToAdviceFood(staple, '午餐或早餐保留主食') : undefined,
    vegetable ? candidateToAdviceFood(vegetable, '午晚餐增加饱腹感') : undefined,
  ].filter((food): food is MealSuggestionAdvice['combo'][number] => Boolean(food));
  return combo.length ? combo : buildGenericCombo(targets);
}

function buildCandidateAlternatives(
  candidates: readonly MealSuggestionCandidate[],
  categories: FoodCategory[],
): MealSuggestionAdvice['alternatives'] {
  const alternatives: MealSuggestionAdvice['alternatives'] = [];
  for (const category of categories) {
    const candidate = candidates.find((item) => item.category === category);
    if (candidate) {
      alternatives.push(candidateToAdviceFood(candidate, reasonForCandidate(candidate, { calories: 0, protein: 0, carbs: 0, fat: 0 })));
    }
  }
  return alternatives;
}

function buildGenericCombo(remaining: MacroValues): MealSuggestionAdvice['combo'] {
  if (remaining.calories < 180) {
    return [
      { name: '清淡蔬菜', servingGrams: 200, calories: 60, protein: 4, carbs: 10, fat: 1, reason: '热量额度偏紧' },
      { name: '低脂蛋白', servingGrams: 80, calories: 100, protein: 18, carbs: 0, fat: 2, reason: '补一点蛋白' },
    ];
  }
  return [
    { name: '低脂蛋白', servingGrams: 120, calories: 160, protein: 28, carbs: 0, fat: 4, reason: '优先补蛋白' },
    { name: '清淡蔬菜', servingGrams: 200, calories: 70, protein: 5, carbs: 12, fat: 1, reason: '增加饱腹感' },
    {
      name: remaining.carbs > 20 ? '小份主食' : '半份主食',
      servingGrams: remaining.carbs > 20 ? 100 : 60,
      calories: remaining.carbs > 20 ? 130 : 80,
      protein: 2,
      carbs: remaining.carbs > 20 ? 28 : 17,
      fat: 1,
      reason: remaining.carbs > 20 ? '补足碳水' : '份量更轻',
    },
  ];
}

function buildFallbackSummary(remaining: MacroValues, mealLabel: string): string {
  if (remaining.calories < 0) {
    return `今天已超出约 ${Math.abs(Math.round(remaining.calories))} kcal，${mealLabel}适合清淡一点，优先蔬菜和低脂蛋白。`;
  }
  const needs = [
    remaining.protein > 18 ? '蛋白质' : '',
    remaining.carbs > 30 ? '碳水' : '',
    remaining.fat < 10 ? '脂肪要收紧' : '',
  ].filter(Boolean);
  return `今天还剩约 ${Math.max(0, Math.round(remaining.calories))} kcal，${needs.length ? `重点照顾${needs.join('、')}` : `${mealLabel}按清淡均衡搭配就好`}。`;
}

function reasonForCandidate(candidate: MealSuggestionCandidate, remaining: MacroValues): string {
  if (candidate.category === 'protein') {
    return remaining.protein > 18 ? '补蛋白优先' : '稳定蛋白来源';
  }
  if (candidate.category === 'vegetable') {
    return '低热量增加饱腹';
  }
  if (candidate.category === 'staple') {
    return remaining.carbs > 25 ? '补足碳水额度' : '少量主食收尾';
  }
  if (candidate.category === 'dairy') {
    return '轻量补蛋白';
  }
  if (candidate.category === 'fruit') {
    return '适合作为餐后小份';
  }
  return '接近当前餐额度';
}

function candidateToAdviceFood(
  candidate: MealSuggestionCandidate,
  reason?: string,
): MealSuggestionAdvice['combo'][number] {
  return {
    foodId: candidate.id,
    name: candidate.name,
    category: candidate.category,
    servingGrams: candidate.servingGrams,
    calories: candidate.calories,
    protein: candidate.protein,
    carbs: candidate.carbs,
    fat: candidate.fat,
    reason,
  };
}

function uniqueById(candidates: MealSuggestionCandidate[]): MealSuggestionCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.id)) {
      return false;
    }
    seen.add(candidate.id);
    return true;
  });
}

function subtractMacros(targets: MacroValues, totals: MacroValues): MacroValues {
  return {
    calories: targets.calories - totals.calories,
    protein: targets.protein - totals.protein,
    carbs: targets.carbs - totals.carbs,
    fat: targets.fat - totals.fat,
  };
}

function normalizeTargetsAsRemaining(targets: MacroValues): MacroValues {
  return {
    calories: targets.calories,
    protein: targets.protein,
    carbs: targets.carbs,
    fat: targets.fat,
  };
}

function bucketMacros(values: MacroValues): MacroValues {
  return {
    calories: Math.round(values.calories / 50) * 50,
    protein: Math.round(values.protein / 5) * 5,
    carbs: Math.round(values.carbs / 5) * 5,
    fat: Math.round(values.fat / 5) * 5,
  };
}

function hasAnyNutrition(values: MacroValues): boolean {
  return values.calories > 0 || values.protein > 0 || values.carbs > 0 || values.fat > 0;
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
