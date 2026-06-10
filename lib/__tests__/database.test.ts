import { describe, expect, it, vi } from 'vitest';

import { DATABASE_VERSION, MIGRATION_V1_SQL, migrateDatabase } from '@/lib/database';

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
    expect(execAsync).toHaveBeenLastCalledWith(`PRAGMA user_version = ${DATABASE_VERSION}`);
    expect(runAsync.mock.calls.some(([sql]) => String(sql).includes('food_catalog'))).toBe(true);
  });
});
