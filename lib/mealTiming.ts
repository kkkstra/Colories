import type { MealType } from '@/types/domain';

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
