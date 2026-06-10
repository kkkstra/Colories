import type {
  ActivityLevel,
  DailyTargets,
  MacroValues,
  UserProfile,
} from '@/types/domain';

export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export function calculateBmr(profile: UserProfile): number {
  const base = 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age;
  return Math.round(base + (profile.sex === 'male' ? 5 : -161));
}

export function calculateTargets(profile: UserProfile): DailyTargets {
  const tdee = calculateBmr(profile) * ACTIVITY_MULTIPLIERS[profile.activityLevel];
  const goalMultiplier = profile.goal === 'cut' ? 0.85 : profile.goal === 'gain' ? 1.1 : 1;
  const calories = Math.max(1200, Math.round(tdee * goalMultiplier));
  const protein = Math.round(profile.weightKg * 1.8);
  const fat = Math.round(profile.weightKg * 0.8);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
  return { calories, protein, carbs, fat };
}

export function scaleNutrition(
  per100g: MacroValues,
  weightGrams: number,
): MacroValues {
  const factor = Math.max(0, weightGrams) / 100;
  return {
    calories: round(per100g.calories * factor, 0),
    protein: round(per100g.protein * factor, 1),
    carbs: round(per100g.carbs * factor, 1),
    fat: round(per100g.fat * factor, 1),
  };
}

export function sumMacros(values: MacroValues[]): MacroValues {
  return values.reduce(
    (total, value) => ({
      calories: total.calories + value.calories,
      protein: total.protein + value.protein,
      carbs: total.carbs + value.carbs,
      fat: total.fat + value.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

export function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function clampNumber(value: unknown, fallback = 0, min = 0, max = 100000): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}
