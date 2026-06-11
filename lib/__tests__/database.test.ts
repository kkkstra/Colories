import { describe, expect, it, vi } from 'vitest';

import {
  DATABASE_VERSION,
  MIGRATION_V1_SQL,
  MIGRATION_V2_SQL,
  MIGRATION_V3_SQL,
  MIGRATION_V4_SQL,
  migrateDatabase,
  saveCustomFood,
  scoreFoodNameMatch,
  updateMeal,
} from '@/lib/database';

describe('database migration', () => {
  it('contains all MVP tables', () => {
    for (const table of [
      'user_profile',
      'daily_targets',
      'food_catalog',
      'food_alias',
      'meals',
      'meal_items',
      'ai_provider_config',
    ]) {
      expect(MIGRATION_V1_SQL).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    expect(MIGRATION_V2_SQL).toContain('ADD COLUMN is_custom');
    expect(MIGRATION_V2_SQL).toContain('ADD COLUMN updated_at');
    expect(MIGRATION_V3_SQL).toContain('ADD COLUMN title');
    expect(MIGRATION_V4_SQL).toContain('ADD COLUMN cooking_method');
  });

  it('seeds catalog and advances user_version on a fresh database', async () => {
    const execAsync = vi.fn().mockResolvedValue(undefined);
    const runAsync = vi.fn().mockResolvedValue({ lastInsertRowId: 1, changes: 1 });
    const db = {
      getFirstAsync: vi
        .fn()
        .mockResolvedValueOnce({ user_version: 0 })
        .mockResolvedValueOnce({ count: 0 }),
      execAsync,
      runAsync,
      withTransactionAsync: async (callback: () => Promise<void>) => callback(),
    };

    await migrateDatabase(db as never);

    expect(execAsync).toHaveBeenCalledWith(MIGRATION_V1_SQL);
    expect(execAsync).toHaveBeenCalledWith(MIGRATION_V2_SQL);
    expect(execAsync).toHaveBeenCalledWith(MIGRATION_V3_SQL);
    expect(execAsync).toHaveBeenCalledWith(MIGRATION_V4_SQL);
    expect(execAsync).toHaveBeenLastCalledWith(`PRAGMA user_version = ${DATABASE_VERSION}`);
    expect(runAsync.mock.calls.some(([sql]) => String(sql).includes('food_catalog'))).toBe(true);
  });

  it('saves custom foods with searchable aliases', async () => {
    const runAsync = vi.fn().mockResolvedValue({ lastInsertRowId: 1, changes: 1 });
    const db = {
      getFirstAsync: vi.fn(),
      runAsync,
      withTransactionAsync: async (callback: () => Promise<void>) => callback(),
    };

    const id = await saveCustomFood(db as never, {
      nameZh: '食堂鸡腿饭',
      nameEn: 'Cafeteria chicken rice',
      category: 'dish',
      cookingMethod: '烤',
      aliases: ['鸡腿饭', '公司午餐'],
      calories: 168,
      protein: 9,
      carbs: 23,
      fat: 4.2,
      sourceReference: '食堂营养公示',
    });

    expect(id).toMatch(/^custom-food-/);
    expect(runAsync.mock.calls[0][0]).toContain('is_custom');
    expect(runAsync.mock.calls[0]).toContain('烤');
    expect(
      runAsync.mock.calls.some(
        ([sql, alias]) => String(sql).includes('food_alias') && alias === '鸡腿饭',
      ),
    ).toBe(true);
  });

  it('scores fuzzy catalog names without over-matching short drinks', () => {
    expect(scoreFoodNameMatch('牛肉盖浇饭', ['牛肉饭'])).toBeGreaterThanOrEqual(68);
    expect(scoreFoodNameMatch('西红柿炒鸡蛋', ['番茄炒蛋', '西红柿炒鸡蛋'])).toBeGreaterThanOrEqual(80);
    expect(scoreFoodNameMatch('可乐鸡翅', ['可乐'])).toBeLessThan(68);
  });

  it('updates meal metadata and items together', async () => {
    const runAsync = vi.fn().mockResolvedValue({ lastInsertRowId: 1, changes: 1 });
    const db = {
      runAsync,
      withTransactionAsync: async (callback: () => Promise<void>) => callback(),
    };

    await updateMeal(db as never, 12, {
      eatenAt: '2026-06-11T12:10:00.000Z',
      mealType: 'lunch',
      title: '牛肉饭套餐',
      notes: '少油',
      items: [
        {
          id: 'item-1',
          name: '牛肉饭',
          weightGrams: 300,
          calories: 620,
          protein: 25,
          carbs: 82,
          fat: 20,
          source: 'manual',
        },
      ],
    });

    expect(runAsync.mock.calls[0][0]).toContain('UPDATE meals');
    expect(runAsync.mock.calls[0]).toContain('lunch');
    expect(runAsync.mock.calls[0]).toContain('牛肉饭套餐');
    expect(runAsync.mock.calls[0]).toContain('少油');
    expect(runAsync.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM meal_items'))).toBe(true);
    expect(runAsync.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO meal_items'))).toBe(true);
  });
});
