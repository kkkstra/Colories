import { toLocalDateKey } from '@/lib/date';
import type {
  MainMealType,
  MealSuggestionScope,
  MealSuggestionTargetType,
  MealType,
} from '@/types/domain';

export interface MealSuggestionTimeTarget {
  dateKey: string;
  targetType: MealSuggestionTargetType;
  scope: MealSuggestionScope;
}

export function inferMealTypeFromDate(date = new Date()): MealType {
  const hour = date.getHours();
  const minute = date.getMinutes();
  const minutes = hour * 60 + minute;

  if (minutes >= 5 * 60 && minutes < 10 * 60 + 30) {
    return 'breakfast';
  }
  if (minutes >= 10 * 60 + 30 && minutes < 15 * 60) {
    return 'lunch';
  }
  if (minutes >= 17 * 60 && minutes < 21 * 60 + 30) {
    return 'dinner';
  }
  return 'snack';
}

export function inferMealSuggestionTargetFromDate(
  date = new Date(),
  recordedMealTypes: readonly MealType[] = [],
): MealSuggestionTimeTarget {
  const minutes = date.getHours() * 60 + date.getMinutes();
  const recordedMainMeals = new Set<MainMealType>(
    recordedMealTypes.filter((mealType): mealType is MainMealType => mealType !== 'snack'),
  );

  const currentDateKey = toLocalDateKey(date);
  const firstCandidate = minutes < 10 * 60 + 30
    ? 'breakfast'
    : minutes < 15 * 60
      ? 'lunch'
      : minutes < 21 * 60 + 30
        ? 'dinner'
        : null;

  if (firstCandidate) {
    const candidates: MainMealType[] = firstCandidate === 'breakfast'
      ? ['breakfast', 'lunch', 'dinner']
      : firstCandidate === 'lunch'
        ? ['lunch', 'dinner']
        : ['dinner'];
    const nextMeal = candidates.find((mealType) => !recordedMainMeals.has(mealType));
    if (nextMeal) {
      return { dateKey: currentDateKey, targetType: nextMeal, scope: 'meal' };
    }
  }

  const tomorrow = new Date(date);
  tomorrow.setDate(date.getDate() + 1);
  return { dateKey: toLocalDateKey(tomorrow), targetType: 'full_day', scope: 'full_day' };
}
