import { describe, expect, it, vi } from 'vitest';

import {
  DATABASE_VERSION,
  MIGRATION_V1_SQL,
  MIGRATION_V2_SQL,
  MIGRATION_V3_SQL,
  MIGRATION_V4_SQL,
  MIGRATION_V5_SQL,
  MIGRATION_V6_SQL,
  getCachedInsightAdvice,
  migrateDatabase,
  saveCachedInsightAdvice,
  saveMeal,
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
      'meal_photos',
      'ai_provider_config',
      'ai_insight_advice',
    ]) {
      expect(`${MIGRATION_V1_SQL}\n${MIGRATION_V5_SQL}\n${MIGRATION_V6_SQL}`).toContain(
        `CREATE TABLE IF NOT EXISTS ${table}`,
      );
    }
    expect(MIGRATION_V2_SQL).toContain('ADD COLUMN is_custom');
    expect(MIGRATION_V2_SQL).toContain('ADD COLUMN updated_at');
    expect(MIGRATION_V3_SQL).toContain('ADD COLUMN title');
    expect(MIGRATION_V4_SQL).toContain('ADD COLUMN cooking_method');
    expect(MIGRATION_V5_SQL).toContain('INSERT INTO meal_photos');
    expect(MIGRATION_V6_SQL).toContain('data_hash');
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
    expect(execAsync).toHaveBeenCalledWith(MIGRATION_V5_SQL);
    expect(execAsync).toHaveBeenCalledWith(MIGRATION_V6_SQL);
    expect(execAsync).toHaveBeenLastCalledWith(`PRAGMA user_version = ${DATABASE_VERSION}`);
    expect(runAsync.mock.calls.some(([sql]) => String(sql).includes('food_catalog'))).toBe(true);
  });

  it('caches weekly insight advice by data hash', async () => {
    const runAsync = vi.fn().mockResolvedValue({ lastInsertRowId: 1, changes: 1 });
    const db = {
      getFirstAsync: vi.fn().mockResolvedValue({
        id: 'weekly',
        data_hash: 'hash-1',
        title: '晚餐稳一点',
        summary: '最近 7 天晚餐热量更高。',
        actions_json: JSON.stringify(['主食固定一拳', '晚餐加蔬菜']),
        warnings_json: JSON.stringify(['有一天未记录']),
        updated_at: '2026-06-11T00:00:00.000Z',
      }),
      runAsync,
    };

    const saved = await saveCachedInsightAdvice(db as never, {
      id: 'weekly',
      dataHash: 'hash-1',
      title: '晚餐稳一点',
      summary: '最近 7 天晚餐热量更高。',
      actions: ['主食固定一拳', '晚餐加蔬菜'],
      warnings: ['有一天未记录'],
    });
    const cached = await getCachedInsightAdvice(db as never, 'weekly');

    expect(saved.updatedAt).toMatch(/T/);
    expect(runAsync.mock.calls[0][0]).toContain('ai_insight_advice');
    expect(cached?.dataHash).toBe('hash-1');
    expect(cached?.actions).toEqual(['主食固定一拳', '晚餐加蔬菜']);
  });

  it('saves multiple meal photos in order while keeping a legacy first photo', async () => {
    const runAsync = vi
      .fn()
      .mockResolvedValueOnce({ lastInsertRowId: 9, changes: 1 })
      .mockResolvedValue({ lastInsertRowId: 1, changes: 1 });
    const db = {
      runAsync,
      withTransactionAsync: async (callback: () => Promise<void>) => callback(),
    };

    await saveMeal(db as never, {
      eatenAt: '2026-06-11T12:10:00.000Z',
      mealType: 'lunch',
      title: '双图午餐',
      photoUris: ['meal-photos/a.jpg', 'meal-photos/b.jpg'],
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

    expect(runAsync.mock.calls[0]).toContain('meal-photos/a.jpg');
    expect(
      runAsync.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO meal_photos')),
    ).toHaveLength(2);
    expect(runAsync.mock.calls.some((call) => call.includes('meal-photos/b.jpg'))).toBe(true);
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
