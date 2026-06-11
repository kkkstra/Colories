import { describe, expect, it, vi } from 'vitest';

import {
  DATABASE_VERSION,
  MIGRATION_V1_SQL,
  MIGRATION_V2_SQL,
  migrateDatabase,
  saveCustomFood,
  scoreFoodNameMatch,
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
      aliases: ['鸡腿饭', '公司午餐'],
      calories: 168,
      protein: 9,
      carbs: 23,
      fat: 4.2,
      sourceReference: '食堂营养公示',
    });

    expect(id).toMatch(/^custom-food-/);
    expect(runAsync.mock.calls[0][0]).toContain('is_custom');
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
});
