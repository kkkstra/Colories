import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFileSystem = vi.hoisted(() => ({
  files: new Map<string, { text?: string; base64?: string; bytes?: Uint8Array }>(),
}));

const mockPlatform = vi.hoisted(() => ({
  OS: 'ios',
}));

const mockSecurity = vi.hoisted(() => ({
  counter: 0,
}));

vi.mock('react-native', () => ({
  Platform: mockPlatform,
}));

vi.mock('expo-file-system', () => {
  function joinParts(parts: unknown[]): string {
    return parts
      .map((part) => (typeof part === 'string' ? part : (part as { uri: string }).uri))
      .join('/')
      .replace(/([^:])\/+/g, '$1/');
  }

  class Directory {
    uri: string;

    constructor(...parts: unknown[]) {
      this.uri = joinParts(parts);
    }

    get exists() {
      return true;
    }

    create() {}

    delete() {}
  }

  class File {
    uri: string;

    constructor(...parts: unknown[]) {
      this.uri = joinParts(parts);
    }

    get exists() {
      return mockFileSystem.files.has(this.uri);
    }

    create() {
      mockFileSystem.files.set(this.uri, mockFileSystem.files.get(this.uri) ?? {});
    }

    write(content: string | Uint8Array) {
      mockFileSystem.files.set(
        this.uri,
        typeof content === 'string' ? { text: content } : { bytes: content },
      );
    }

    async text() {
      return mockFileSystem.files.get(this.uri)?.text ?? '';
    }

    async base64() {
      return mockFileSystem.files.get(this.uri)?.base64 ?? '';
    }
  }

  return {
    Directory,
    File,
    Paths: {
      cache: { uri: 'file://cache' },
      document: { uri: 'file://document' },
    },
  };
});

vi.mock('@/lib/security', () => ({
  createLocalId: (prefix = 'item') => {
    mockSecurity.counter += 1;
    return `${prefix}-${mockSecurity.counter}`;
  },
}));

import {
  BACKUP_APP_ID,
  BACKUP_SCHEMA_VERSION,
  createCaloriesBackup,
  importCaloriesBackup,
  parseCaloriesBackup,
  type CaloriesBackupV1,
} from '@/lib/dataTransfer';
import { DATABASE_VERSION } from '@/lib/database';

describe('data transfer', () => {
  beforeEach(() => {
    mockFileSystem.files.clear();
    mockPlatform.OS = 'ios';
    mockSecurity.counter = 0;
  });

  it('exports app data and photo payloads without API keys', async () => {
    mockFileSystem.files.set('file://document/meal-photos/lunch.jpg', {
      base64: 'photo-base64',
    });
    const db = createMockDb({
      user_profile: [
        {
          id: 1,
          age: 30,
          height_cm: 175,
          weight_kg: 70,
          sex: 'male',
          activity_level: 'moderate',
          goal: 'maintain',
          updated_at: '2026-06-11T00:00:00.000Z',
        },
      ],
      daily_targets: [],
      food_catalog: [customFood('custom-rice')],
      food_alias: [{ alias: '米饭', normalized_alias: '米饭', food_id: 'custom-rice' }],
      meals: [meal(7, 'meal-photos/lunch.jpg')],
      meal_items: [mealItem(7, 'custom-rice')],
      meal_photos: [{ id: 1, meal_id: 7, uri: 'meal-photos/lunch.jpg', sort_order: 0 }],
      ai_provider_config: [
        {
          id: 1,
          base_url: 'https://example.com/v1',
          model: 'vision-model',
          response_mode: 'json_schema',
          updated_at: '2026-06-11T00:00:00.000Z',
        },
      ],
      ai_insight_advice: [],
    });

    const { backup, skippedPhotos } = await createCaloriesBackup(db as never);

    expect(skippedPhotos).toBe(0);
    expect(backup.data.customFoods).toHaveLength(1);
    expect(backup.data.photos).toEqual([
      { reference: 'meal-photos/lunch.jpg', mediaType: 'image/jpeg', base64: 'photo-base64' },
    ]);
    expect(JSON.stringify(backup)).not.toContain('sk-secret');
  });

  it('replaces local data while preserving meal ids and restoring photo bytes', async () => {
    const db = createMockDb();
    const backup = backupFixture({
      customFoods: [customFood('custom-rice')],
      foodAliases: [{ alias: '米饭', normalized_alias: '米饭', food_id: 'custom-rice' }],
      meals: [meal(7, 'meal-photos/lunch.jpg')],
      mealItems: [mealItem(7, 'custom-rice')],
      mealPhotos: [{ id: 1, meal_id: 7, uri: 'meal-photos/lunch.jpg', sort_order: 0 }],
      photos: [{ reference: 'meal-photos/lunch.jpg', mediaType: 'image/jpeg', base64: 'aGVsbG8=' }],
    });

    const result = await importCaloriesBackup(db as never, backup, 'replace');

    expect(result).toMatchObject({ mode: 'replace', meals: 1, customFoods: 1, photosRestored: 1 });
    expect(db.runAsync.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM meals'))).toBe(
      true,
    );
    expect(
      db.runAsync.mock.calls.some(
        ([sql, params]) =>
          String(sql).includes('INSERT INTO meals') &&
          Array.isArray(params) &&
          params[0] === 7 &&
          params[5] === 'meal-photos/lunch.jpg',
      ),
    ).toBe(true);
    expect(mockFileSystem.files.get('file://document/meal-photos/lunch.jpg')?.bytes).toEqual(
      new Uint8Array([104, 101, 108, 108, 111]),
    );
  });

  it('merges records by remapping meal ids and conflicting custom food ids', async () => {
    const db = createMockDb({
      food_catalog: [{ ...customFood('custom-rice'), name_zh: '旧米饭' }],
    });
    const backup = backupFixture({
      customFoods: [customFood('custom-rice')],
      foodAliases: [{ alias: '米饭', normalized_alias: '米饭', food_id: 'custom-rice' }],
      meals: [meal(7, null)],
      mealItems: [mealItem(7, 'custom-rice')],
    });

    const result = await importCaloriesBackup(db as never, backup, 'merge');

    expect(result).toMatchObject({ mode: 'merge', meals: 1, customFoods: 1 });
    expect(
      db.runAsync.mock.calls.some(
        ([sql, params]) =>
          String(sql).includes('INSERT INTO food_catalog') &&
          Array.isArray(params) &&
          params[0] === 'custom-food-1',
      ),
    ).toBe(true);
    expect(
      db.runAsync.mock.calls.some(
        ([sql, params]) =>
          String(sql).includes('INSERT INTO meal_items') &&
          Array.isArray(params) &&
          params[1] === 101 &&
          params[11] === 'custom-food-1',
      ),
    ).toBe(true);
  });

  it('rejects invalid and future-version backups', () => {
    expect(() => parseCaloriesBackup('not-json')).toThrow('JSON');
    expect(() =>
      parseCaloriesBackup(
        JSON.stringify({
          ...backupFixture(),
          databaseVersion: DATABASE_VERSION + 1,
        }),
      ),
    ).toThrow('更新版本');
  });
});

function createMockDb(tables: Partial<Record<string, unknown[]>> = {}) {
  let nextMealId = 100;
  const db = {
    getAllAsync: vi.fn(async (sql: string) => {
      if (sql.includes('FROM user_profile')) return tables.user_profile ?? [];
      if (sql.includes('FROM daily_targets')) return tables.daily_targets ?? [];
      if (sql.includes('FROM food_alias')) return tables.food_alias ?? [];
      if (sql.includes('FROM food_catalog')) return tables.food_catalog ?? [];
      if (sql.includes('FROM meals')) return tables.meals ?? [];
      if (sql.includes('FROM meal_items')) return tables.meal_items ?? [];
      if (sql.includes('FROM meal_photos')) return tables.meal_photos ?? [];
      if (sql.includes('FROM ai_provider_config')) return tables.ai_provider_config ?? [];
      if (sql.includes('FROM ai_insight_advice')) return tables.ai_insight_advice ?? [];
      return [];
    }),
    getFirstAsync: vi.fn(async (sql: string, ...params: unknown[]) => {
      if (sql.includes('FROM food_catalog WHERE id = ?')) {
        return (tables.food_catalog ?? []).find(
          (row) => (row as { id: string }).id === params[0],
        ) ?? null;
      }
      return null;
    }),
    runAsync: vi.fn(async (sql: string, params?: unknown) => {
      if (sql.includes('INSERT INTO meals') && !sql.includes('(id,')) {
        nextMealId += 1;
        return { lastInsertRowId: nextMealId, changes: 1 };
      }
      return { lastInsertRowId: 1, changes: 1 };
    }),
    withTransactionAsync: vi.fn(async (callback: () => Promise<void>) => callback()),
    withExclusiveTransactionAsync: vi.fn(async (callback: (txn: unknown) => Promise<void>) =>
      callback(db),
    ),
  };
  return db;
}

function backupFixture(
  data: Partial<CaloriesBackupV1['data']> = {},
): CaloriesBackupV1 {
  return {
    appId: BACKUP_APP_ID,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    databaseVersion: DATABASE_VERSION,
    exportedAt: '2026-06-11T00:00:00.000Z',
    data: {
      userProfile: [],
      dailyTargets: [],
      customFoods: [],
      foodAliases: [],
      meals: [],
      mealItems: [],
      mealPhotos: [],
      aiProviderConfig: [],
      aiInsightAdvice: [],
      photos: [],
      ...data,
    },
  };
}

function customFood(id: string): CaloriesBackupV1['data']['customFoods'][number] {
  return {
    id,
    name_zh: '米饭',
    name_en: 'Rice',
    category: 'staple',
    cooking_method: null,
    calories: 116,
    protein: 2.6,
    carbs: 25.9,
    fat: 0.3,
    source_reference: '用户自定义',
    is_custom: 1,
    updated_at: '2026-06-11T00:00:00.000Z',
  };
}

function meal(
  id: number,
  photoUri: string | null,
): CaloriesBackupV1['data']['meals'][number] {
  return {
    id,
    eaten_at: '2026-06-11T12:00:00.000Z',
    date_key: '2026-06-11',
    meal_type: 'lunch',
    title: '午餐',
    photo_uri: photoUri,
    notes: null,
    created_at: '2026-06-11T12:00:00.000Z',
    updated_at: '2026-06-11T12:00:00.000Z',
  };
}

function mealItem(
  mealId: number,
  catalogFoodId: string | null,
): CaloriesBackupV1['data']['mealItems'][number] {
  return {
    id: `item-${mealId}`,
    meal_id: mealId,
    name: '米饭',
    weight_grams: 200,
    calories: 232,
    protein: 5.2,
    carbs: 51.8,
    fat: 0.6,
    source: 'manual',
    confidence: null,
    cooking_method: null,
    catalog_food_id: catalogFoodId,
    warning: null,
  };
}
