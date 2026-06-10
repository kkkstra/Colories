import { describe, expect, it } from 'vitest';

import { calculateBmr, calculateTargets, scaleNutrition } from '@/lib/nutrition';
import type { UserProfile } from '@/types/domain';

const profile: UserProfile = {
  age: 30,
  heightCm: 175,
  weightKg: 70,
  sex: 'male',
  activityLevel: 'moderate',
  goal: 'maintain',
};

describe('nutrition calculations', () => {
  it('calculates Mifflin-St Jeor BMR', () => {
    expect(calculateBmr(profile)).toBe(1649);
  });

  it('applies goal multipliers and macro defaults', () => {
    const maintain = calculateTargets(profile);
    const cut = calculateTargets({ ...profile, goal: 'cut' });
    const gain = calculateTargets({ ...profile, goal: 'gain' });

    expect(maintain.calories).toBe(2556);
    expect(cut.calories).toBe(2173);
    expect(gain.calories).toBe(2812);
    expect(maintain.protein).toBe(126);
    expect(maintain.fat).toBe(56);
    expect(maintain.carbs).toBe(387);
  });

  it('scales per-100g values with predictable rounding', () => {
    expect(scaleNutrition({ calories: 165, protein: 31, carbs: 0, fat: 3.6 }, 150)).toEqual({
      calories: 248,
      protein: 46.5,
      carbs: 0,
      fat: 5.4,
    });
  });
});
