import { describe, expect, it } from 'vitest';

import { inferMealTypeFromDate } from '@/lib/mealTiming';

describe('meal timing', () => {
  it.each([
    ['2026-06-11T07:30:00+08:00', 'breakfast'],
    ['2026-06-11T12:15:00+08:00', 'lunch'],
    ['2026-06-11T19:10:00+08:00', 'dinner'],
    ['2026-06-11T23:20:00+08:00', 'snack'],
  ] as const)('infers %s as %s', (iso, expected) => {
    expect(inferMealTypeFromDate(new Date(iso))).toBe(expected);
  });

  it('treats late morning and late night as snack windows', () => {
    expect(inferMealTypeFromDate(new Date('2026-06-11T10:29:00+08:00'))).toBe('breakfast');
    expect(inferMealTypeFromDate(new Date('2026-06-11T15:01:00+08:00'))).toBe('snack');
    expect(inferMealTypeFromDate(new Date('2026-06-11T21:30:00+08:00'))).toBe('snack');
  });
});
