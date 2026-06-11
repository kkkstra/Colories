import type { MealItemDraft, MealRecord } from '@/types/domain';

const MAX_MEAL_TITLE_LENGTH = 18;

export function normalizeMealTitle(value: string | null | undefined): string | undefined {
  const normalized = value
    ?.trim()
    .replace(/\s+/g, ' ')
    .replace(/^[，,、。；;\s]+|[，,、。；;\s]+$/g, '');
  if (!normalized) {
    return undefined;
  }
  return normalized.length > MAX_MEAL_TITLE_LENGTH
    ? normalized.slice(0, MAX_MEAL_TITLE_LENGTH)
    : normalized;
}

export function createMealTitle(items: MealItemDraft[]): string | undefined {
  const names = Array.from(
    new Set(
      items
        .map((item) => item.name.trim())
        .filter(Boolean),
    ),
  );
  if (names.length === 0) {
    return undefined;
  }
  if (names.length === 1) {
    return normalizeMealTitle(names[0]);
  }
  const visibleNames = names.slice(0, 3).join('、');
  return normalizeMealTitle(names.length > 3 ? `${visibleNames}等` : visibleNames);
}

export function resolveMealTitle(
  title: string | null | undefined,
  items: MealItemDraft[],
): string | undefined {
  return normalizeMealTitle(title) ?? createMealTitle(items);
}

export function getMealDisplayTitle(meal: Pick<MealRecord, 'title' | 'items'>): string {
  return resolveMealTitle(meal.title, meal.items) ?? '未命名餐食';
}
