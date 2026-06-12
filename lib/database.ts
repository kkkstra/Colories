import type { SQLiteDatabase } from 'expo-sqlite';

import { FOOD_CATALOG } from '@/data/foodCatalog';
import { endOfLocalDayIso, startOfLocalDayIso, toLocalDateKey } from '@/lib/date';
import { resolveMealTitle } from '@/lib/mealTitle';
import { sumMacros } from '@/lib/nutrition';
import { normalizeMealPhotoReferences } from '@/lib/photoReference';
import {
  DEFAULT_REMINDER_SETTINGS,
  reminderSettingsFromPartial,
  validateReminderSettings,
} from '@/lib/reminderSettings';
import { createLocalId } from '@/lib/security';
import type {
  AIProviderConfig,
  DailyTargets,
  MealSuggestionAdvice,
  FoodCategory,
  MacroValues,
  MealItemDraft,
  MealRecord,
  MealType,
  NutritionInsightAdvice,
  NutritionSource,
  ReminderSettings,
  UserProfile,
} from '@/types/domain';

export const DATABASE_VERSION = 7;

export const MIGRATION_V1_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS user_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  age INTEGER NOT NULL,
  height_cm REAL NOT NULL,
  weight_kg REAL NOT NULL,
  sex TEXT NOT NULL,
  activity_level TEXT NOT NULL,
  goal TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_targets (
  date_key TEXT PRIMARY KEY,
  calories REAL NOT NULL,
  protein REAL NOT NULL,
  carbs REAL NOT NULL,
  fat REAL NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS food_catalog (
  id TEXT PRIMARY KEY,
  name_zh TEXT NOT NULL,
  name_en TEXT,
  category TEXT NOT NULL,
  calories REAL NOT NULL,
  protein REAL NOT NULL,
  carbs REAL NOT NULL,
  fat REAL NOT NULL,
  source_reference TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS food_alias (
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  food_id TEXT NOT NULL REFERENCES food_catalog(id) ON DELETE CASCADE,
  PRIMARY KEY (normalized_alias, food_id)
);

CREATE TABLE IF NOT EXISTS meals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  eaten_at TEXT NOT NULL,
  date_key TEXT NOT NULL,
  meal_type TEXT NOT NULL,
  photo_uri TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meal_items (
  id TEXT PRIMARY KEY,
  meal_id INTEGER NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  weight_grams REAL NOT NULL,
  calories REAL NOT NULL,
  protein REAL NOT NULL,
  carbs REAL NOT NULL,
  fat REAL NOT NULL,
  source TEXT NOT NULL,
  confidence REAL,
  cooking_method TEXT,
  catalog_food_id TEXT,
  warning TEXT
);

CREATE TABLE IF NOT EXISTS ai_provider_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  base_url TEXT NOT NULL,
  model TEXT NOT NULL,
  response_mode TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_meals_date_key ON meals(date_key);
CREATE INDEX IF NOT EXISTS idx_meal_items_meal_id ON meal_items(meal_id);
CREATE INDEX IF NOT EXISTS idx_food_alias_normalized ON food_alias(normalized_alias);
`;

export const MIGRATION_V2_SQL = `
ALTER TABLE food_catalog ADD COLUMN is_custom INTEGER NOT NULL DEFAULT 0;
ALTER TABLE food_catalog ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_food_catalog_category ON food_catalog(category);
CREATE INDEX IF NOT EXISTS idx_food_catalog_custom ON food_catalog(is_custom);
`;

export const MIGRATION_V3_SQL = `
ALTER TABLE meals ADD COLUMN title TEXT;
`;

export const MIGRATION_V4_SQL = `
ALTER TABLE food_catalog ADD COLUMN cooking_method TEXT;
`;

export const MIGRATION_V5_SQL = `
CREATE TABLE IF NOT EXISTS meal_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meal_id INTEGER NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  uri TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_meal_photos_meal_id ON meal_photos(meal_id);

INSERT INTO meal_photos (meal_id, uri, sort_order)
SELECT id, photo_uri, 0
FROM meals
WHERE photo_uri IS NOT NULL AND photo_uri != '';
`;

export const MIGRATION_V6_SQL = `
CREATE TABLE IF NOT EXISTS ai_insight_advice (
  id TEXT PRIMARY KEY,
  data_hash TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  actions_json TEXT NOT NULL,
  warnings_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export const MIGRATION_V7_SQL = `
CREATE TABLE IF NOT EXISTS reminder_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL,
  breakfast_enabled INTEGER NOT NULL,
  breakfast_hour INTEGER NOT NULL,
  breakfast_minute INTEGER NOT NULL,
  lunch_enabled INTEGER NOT NULL,
  lunch_hour INTEGER NOT NULL,
  lunch_minute INTEGER NOT NULL,
  dinner_enabled INTEGER NOT NULL,
  dinner_hour INTEGER NOT NULL,
  dinner_minute INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export async function migrateDatabase(db: SQLiteDatabase): Promise<void> {
  const versionRow = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = versionRow?.user_version ?? 0;
  if (currentVersion < 1) {
    await db.execAsync(MIGRATION_V1_SQL);
  }
  if (currentVersion < 2) {
    await db.execAsync(MIGRATION_V2_SQL);
  }
  if (currentVersion < 3) {
    await db.execAsync(MIGRATION_V3_SQL);
  }
  if (currentVersion < 4) {
    await db.execAsync(MIGRATION_V4_SQL);
  }
  if (currentVersion < 5) {
    await db.execAsync(MIGRATION_V5_SQL);
  }
  if (currentVersion < 6) {
    await db.execAsync(MIGRATION_V6_SQL);
  }
  if (currentVersion < 7) {
    await db.execAsync(MIGRATION_V7_SQL);
  }
  await seedFoodCatalog(db);
  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}

async function seedFoodCatalog(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM food_catalog WHERE is_custom = 0',
  );
  if ((row?.count ?? 0) >= FOOD_CATALOG.length) {
    return;
  }

  await db.withTransactionAsync(async () => {
    const now = new Date().toISOString();
    for (const food of FOOD_CATALOG) {
      await db.runAsync(
        `INSERT OR REPLACE INTO food_catalog
          (id, name_zh, name_en, category, cooking_method, calories, protein, carbs, fat, source_reference, is_custom, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        food.id,
        food.nameZh,
        food.nameEn ?? null,
        food.category,
        food.cookingMethod ?? null,
        food.calories,
        food.protein,
        food.carbs,
        food.fat,
        food.sourceReference,
        now,
      );
      const aliases = new Set([food.nameZh, food.nameEn ?? '', ...food.aliases].filter(Boolean));
      for (const alias of aliases) {
        await db.runAsync(
          `INSERT OR IGNORE INTO food_alias (alias, normalized_alias, food_id)
           VALUES (?, ?, ?)`,
          alias,
          normalizeForDb(alias),
          food.id,
        );
      }
    }
  });
}

export async function getUserProfile(db: SQLiteDatabase): Promise<UserProfile | null> {
  const row = await db.getFirstAsync<{
    age: number;
    height_cm: number;
    weight_kg: number;
    sex: UserProfile['sex'];
    activity_level: UserProfile['activityLevel'];
    goal: UserProfile['goal'];
  }>('SELECT age, height_cm, weight_kg, sex, activity_level, goal FROM user_profile WHERE id = 1');
  if (!row) {
    return null;
  }
  return {
    age: row.age,
    heightCm: row.height_cm,
    weightKg: row.weight_kg,
    sex: row.sex,
    activityLevel: row.activity_level,
    goal: row.goal,
  };
}

export async function saveUserProfile(db: SQLiteDatabase, profile: UserProfile): Promise<void> {
  await db.runAsync(
    `INSERT INTO user_profile
      (id, age, height_cm, weight_kg, sex, activity_level, goal, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
      age = excluded.age,
      height_cm = excluded.height_cm,
      weight_kg = excluded.weight_kg,
      sex = excluded.sex,
      activity_level = excluded.activity_level,
      goal = excluded.goal,
      updated_at = excluded.updated_at`,
    profile.age,
    profile.heightCm,
    profile.weightKg,
    profile.sex,
    profile.activityLevel,
    profile.goal,
    new Date().toISOString(),
  );
}

export async function getTargets(
  db: SQLiteDatabase,
  dateKey = toLocalDateKey(),
): Promise<DailyTargets | null> {
  const row = await db.getFirstAsync<DailyTargets>(
    `SELECT calories, protein, carbs, fat
     FROM daily_targets
     WHERE date_key IN (?, 'default')
     ORDER BY CASE WHEN date_key = ? THEN 0 ELSE 1 END
     LIMIT 1`,
    dateKey,
    dateKey,
  );
  return row ?? null;
}

export async function saveDefaultTargets(
  db: SQLiteDatabase,
  targets: DailyTargets,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO daily_targets (date_key, calories, protein, carbs, fat, updated_at)
     VALUES ('default', ?, ?, ?, ?, ?)
     ON CONFLICT(date_key) DO UPDATE SET
      calories = excluded.calories,
      protein = excluded.protein,
      carbs = excluded.carbs,
      fat = excluded.fat,
      updated_at = excluded.updated_at`,
    targets.calories,
    targets.protein,
    targets.carbs,
    targets.fat,
    new Date().toISOString(),
  );
}

type ReminderSettingsRow = {
  enabled: number;
  breakfast_enabled: number;
  breakfast_hour: number;
  breakfast_minute: number;
  lunch_enabled: number;
  lunch_hour: number;
  lunch_minute: number;
  dinner_enabled: number;
  dinner_hour: number;
  dinner_minute: number;
};

export async function getReminderSettings(db: SQLiteDatabase): Promise<ReminderSettings> {
  const row = await db.getFirstAsync<ReminderSettingsRow>(
    `SELECT enabled,
      breakfast_enabled, breakfast_hour, breakfast_minute,
      lunch_enabled, lunch_hour, lunch_minute,
      dinner_enabled, dinner_hour, dinner_minute
     FROM reminder_settings
     WHERE id = 1`,
  );
  if (!row) {
    return reminderSettingsFromPartial(DEFAULT_REMINDER_SETTINGS);
  }
  return reminderSettingsFromPartial({
    enabled: row.enabled === 1,
    meals: {
      breakfast: {
        enabled: row.breakfast_enabled === 1,
        hour: row.breakfast_hour,
        minute: row.breakfast_minute,
      },
      lunch: {
        enabled: row.lunch_enabled === 1,
        hour: row.lunch_hour,
        minute: row.lunch_minute,
      },
      dinner: {
        enabled: row.dinner_enabled === 1,
        hour: row.dinner_hour,
        minute: row.dinner_minute,
      },
    },
  });
}

export async function saveReminderSettings(
  db: SQLiteDatabase,
  settings: ReminderSettings,
): Promise<void> {
  const nextSettings = validateReminderSettings(settings);
  await db.runAsync(
    `INSERT INTO reminder_settings
      (id, enabled,
       breakfast_enabled, breakfast_hour, breakfast_minute,
       lunch_enabled, lunch_hour, lunch_minute,
       dinner_enabled, dinner_hour, dinner_minute,
       updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
      enabled = excluded.enabled,
      breakfast_enabled = excluded.breakfast_enabled,
      breakfast_hour = excluded.breakfast_hour,
      breakfast_minute = excluded.breakfast_minute,
      lunch_enabled = excluded.lunch_enabled,
      lunch_hour = excluded.lunch_hour,
      lunch_minute = excluded.lunch_minute,
      dinner_enabled = excluded.dinner_enabled,
      dinner_hour = excluded.dinner_hour,
      dinner_minute = excluded.dinner_minute,
      updated_at = excluded.updated_at`,
    boolToInt(nextSettings.enabled),
    boolToInt(nextSettings.meals.breakfast.enabled),
    nextSettings.meals.breakfast.hour,
    nextSettings.meals.breakfast.minute,
    boolToInt(nextSettings.meals.lunch.enabled),
    nextSettings.meals.lunch.hour,
    nextSettings.meals.lunch.minute,
    boolToInt(nextSettings.meals.dinner.enabled),
    nextSettings.meals.dinner.hour,
    nextSettings.meals.dinner.minute,
    new Date().toISOString(),
  );
}

export interface CatalogSearchRow {
  id: string;
  nameZh: string;
  nameEn?: string;
  category: FoodCategory;
  cookingMethod?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  sourceReference: string;
  isCustom: boolean;
}

export interface ManagedFood extends CatalogSearchRow {
  aliases: string[];
}

export type FoodMatchKind = 'exact' | 'fuzzy';

export interface FoodMatch extends CatalogSearchRow {
  matchKind: FoodMatchKind;
  score: number;
}

export type FoodCatalogScope = 'all' | 'built_in' | 'custom';

export interface FoodCatalogStats {
  total: number;
  builtIn: number;
  custom: number;
}

export type FoodCatalogInput = MacroValues & {
  id?: string;
  nameZh: string;
  nameEn?: string;
  category: FoodCategory;
  cookingMethod?: string;
  aliases?: string[];
  sourceReference?: string;
};

type FoodCatalogDbRow = {
  id: string;
  name_zh: string;
  name_en: string | null;
  category: FoodCategory;
  cooking_method: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source_reference: string;
  is_custom: number;
};

export async function searchFoods(
  db: SQLiteDatabase,
  query: string,
  limit = 20,
): Promise<CatalogSearchRow[]> {
  const normalized = normalizeForDb(query);
  const rows = await db.getAllAsync<FoodCatalogDbRow>(
    normalized
      ? `SELECT DISTINCT f.*
         FROM food_catalog f
         LEFT JOIN food_alias a ON a.food_id = f.id
         WHERE a.normalized_alias LIKE ? OR f.name_zh LIKE ? OR f.name_en LIKE ? OR f.cooking_method LIKE ?
         ORDER BY CASE WHEN a.normalized_alias = ? THEN 0 ELSE 1 END, f.is_custom DESC, f.name_zh
         LIMIT ?`
      : `SELECT * FROM food_catalog ORDER BY is_custom DESC, category, name_zh LIMIT ?`,
    ...(normalized
      ? [`%${normalized}%`, `%${query}%`, `%${query}%`, `%${query}%`, normalized, limit]
      : [limit]),
  );
  return rows.map(mapCatalogRow);
}

export async function findFoodMatch(
  db: SQLiteDatabase,
  name: string,
): Promise<FoodMatch | null> {
  const normalized = normalizeForDb(name);
  if (!normalized) {
    return null;
  }

  const exactRow = await db.getFirstAsync<FoodCatalogDbRow>(
    `SELECT f.*
     FROM food_catalog f
     JOIN food_alias a ON a.food_id = f.id
     WHERE a.normalized_alias = ?
     ORDER BY CASE WHEN f.name_zh = ? THEN 0 ELSE 1 END, f.is_custom DESC
     LIMIT 1`,
    normalized,
    name,
  );
  if (exactRow) {
    return { ...mapCatalogRow(exactRow), matchKind: 'exact', score: 100 };
  }

  const rows = await db.getAllAsync<FoodCatalogDbRow & { alias_list: string | null }>(
    `SELECT f.*, GROUP_CONCAT(a.alias, char(31)) AS alias_list
     FROM food_catalog f
     LEFT JOIN food_alias a ON a.food_id = f.id
     GROUP BY f.id
     ORDER BY f.is_custom DESC, f.category, f.name_zh`,
  );
  let best: { row: FoodCatalogDbRow; score: number } | null = null;
  for (const row of rows) {
    const aliases = row.alias_list ? row.alias_list.split('\u001f') : [];
    const score =
      scoreFoodNameMatch(name, [row.name_zh, row.name_en ?? '', ...aliases]) +
      (row.is_custom === 1 ? 2 : 0);
    if (!best || score > best.score) {
      best = { row, score };
    }
  }

  return best && best.score >= 68
    ? { ...mapCatalogRow(best.row), matchKind: 'fuzzy', score: best.score }
    : null;
}

export function scoreFoodNameMatch(query: string, candidates: string[]): number {
  const normalizedQuery = normalizeForDb(query);
  if (!normalizedQuery) {
    return 0;
  }

  return Math.max(
    0,
    ...candidates.map((candidate) => {
      const normalizedCandidate = normalizeForDb(candidate);
      if (!normalizedCandidate) {
        return 0;
      }
      if (normalizedCandidate === normalizedQuery) {
        return 100;
      }
      if (normalizedCandidate.includes(normalizedQuery)) {
        const ratio = normalizedQuery.length / normalizedCandidate.length;
        return Math.round(88 + ratio * 8);
      }
      if (normalizedQuery.includes(normalizedCandidate)) {
        const ratio = normalizedCandidate.length / normalizedQuery.length;
        if (normalizedCandidate.length <= 2 && ratio < 0.62) {
          return Math.round(48 + ratio * 18);
        }
        return Math.round(70 + ratio * 15);
      }

      const queryChars = Array.from(new Set(normalizedQuery));
      const candidateChars = Array.from(new Set(normalizedCandidate));
      const overlap = queryChars.filter((char) => candidateChars.includes(char)).length;
      const queryCoverage = overlap / queryChars.length;
      const candidateCoverage = overlap / candidateChars.length;
      const lengthRatio =
        Math.min(normalizedQuery.length, normalizedCandidate.length) /
        Math.max(normalizedQuery.length, normalizedCandidate.length);
      const score = queryCoverage * 48 + candidateCoverage * 32 + lengthRatio * 12;
      return Math.round(score);
    }),
  );
}

export async function getFoodCatalogStats(db: SQLiteDatabase): Promise<FoodCatalogStats> {
  const row = await db.getFirstAsync<{
    total: number;
    custom: number;
    built_in: number;
  }>(
    `SELECT
      COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN is_custom = 1 THEN 1 ELSE 0 END), 0) AS custom,
      COALESCE(SUM(CASE WHEN is_custom = 0 THEN 1 ELSE 0 END), 0) AS built_in
     FROM food_catalog`,
  );
  return {
    total: row?.total ?? 0,
    custom: row?.custom ?? 0,
    builtIn: row?.built_in ?? 0,
  };
}

export async function getManagedFoods(
  db: SQLiteDatabase,
  {
    query,
    category,
    scope,
    limit = 80,
    offset = 0,
  }: {
    query: string;
    category?: FoodCategory | 'all';
    scope?: FoodCatalogScope;
    limit?: number;
    offset?: number;
  },
): Promise<ManagedFood[]> {
  const { whereSql, params } = buildFoodCatalogFilter({ query, category, scope });

  const rows = await db.getAllAsync<FoodCatalogDbRow & { alias_list: string | null }>(
    `SELECT f.*, GROUP_CONCAT(a.alias, char(31)) AS alias_list
     FROM food_catalog f
     LEFT JOIN food_alias a ON a.food_id = f.id
     ${whereSql}
     GROUP BY f.id
     ORDER BY f.is_custom DESC, f.category, f.name_zh
     LIMIT ? OFFSET ?`,
    ...params,
    limit,
    offset,
  );

  return rows.map((row) => ({
    ...mapCatalogRow(row),
    aliases: row.alias_list ? row.alias_list.split('\u001f').filter(Boolean) : [],
  }));
}

export async function countManagedFoods(
  db: SQLiteDatabase,
  {
    query,
    category,
    scope,
  }: {
    query: string;
    category?: FoodCategory | 'all';
    scope?: FoodCatalogScope;
  },
): Promise<number> {
  const { whereSql, params } = buildFoodCatalogFilter({ query, category, scope });
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM food_catalog f ${whereSql}`,
    ...params,
  );
  return row?.count ?? 0;
}

export async function getManagedFoodById(
  db: SQLiteDatabase,
  id: string,
): Promise<ManagedFood | null> {
  const row = await db.getFirstAsync<FoodCatalogDbRow & { alias_list: string | null }>(
    `SELECT f.*, GROUP_CONCAT(a.alias, char(31)) AS alias_list
     FROM food_catalog f
     LEFT JOIN food_alias a ON a.food_id = f.id
     WHERE f.id = ?
     GROUP BY f.id
     LIMIT 1`,
    id,
  );
  return row
    ? {
        ...mapCatalogRow(row),
        aliases: row.alias_list ? row.alias_list.split('\u001f').filter(Boolean) : [],
      }
    : null;
}

export async function saveCustomFood(
  db: SQLiteDatabase,
  input: FoodCatalogInput,
): Promise<string> {
  const now = new Date().toISOString();
  const id = input.id ?? createLocalId('custom-food');
  const aliases = normalizeAliasList([
    input.nameZh,
    input.nameEn ?? '',
    ...(input.aliases ?? []),
  ]);

  await db.withTransactionAsync(async () => {
    if (input.id) {
      const existing = await db.getFirstAsync<{ is_custom: number }>(
        'SELECT is_custom FROM food_catalog WHERE id = ?',
        input.id,
      );
      if (!existing?.is_custom) {
        throw new Error('只能编辑自己创建的食物。');
      }
    }

    await db.runAsync(
      `INSERT INTO food_catalog
        (id, name_zh, name_en, category, cooking_method, calories, protein, carbs, fat, source_reference, is_custom, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
       ON CONFLICT(id) DO UPDATE SET
        name_zh = excluded.name_zh,
        name_en = excluded.name_en,
        category = excluded.category,
        cooking_method = excluded.cooking_method,
        calories = excluded.calories,
        protein = excluded.protein,
        carbs = excluded.carbs,
        fat = excluded.fat,
        source_reference = excluded.source_reference,
        updated_at = excluded.updated_at`,
      id,
      input.nameZh.trim(),
      input.nameEn?.trim() || null,
      input.category,
      input.cookingMethod?.trim() || null,
      input.calories,
      input.protein,
      input.carbs,
      input.fat,
      input.sourceReference?.trim() || '用户自定义；请按包装营养标签、品牌官网或可信食物成分表维护',
      now,
    );
    await db.runAsync('DELETE FROM food_alias WHERE food_id = ?', id);
    for (const alias of aliases) {
      await db.runAsync(
        `INSERT OR IGNORE INTO food_alias (alias, normalized_alias, food_id)
         VALUES (?, ?, ?)`,
        alias,
        normalizeForDb(alias),
        id,
      );
    }
  });

  return id;
}

export async function deleteCustomFood(db: SQLiteDatabase, id: string): Promise<void> {
  const result = await db.runAsync('DELETE FROM food_catalog WHERE id = ? AND is_custom = 1', id);
  if (result.changes === 0) {
    throw new Error('只能删除自己创建的食物。');
  }
}

function mapCatalogRow(row: FoodCatalogDbRow): CatalogSearchRow {
  return {
    id: row.id,
    nameZh: row.name_zh,
    nameEn: row.name_en ?? undefined,
    category: row.category,
    cookingMethod: row.cooking_method ?? undefined,
    calories: row.calories,
    protein: row.protein,
    carbs: row.carbs,
    fat: row.fat,
    sourceReference: row.source_reference,
    isCustom: row.is_custom === 1,
  };
}

function normalizeAliasList(values: string[]): string[] {
  const seen = new Set<string>();
  const aliases: string[] = [];
  for (const value of values) {
    const alias = value.trim();
    const normalized = normalizeForDb(alias);
    if (!alias || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    aliases.push(alias);
  }
  return aliases;
}

function boolToInt(value: boolean): number {
  return value ? 1 : 0;
}

function buildFoodCatalogFilter({
  query,
  category,
  scope,
}: {
  query: string;
  category?: FoodCategory | 'all';
  scope?: FoodCatalogScope;
}): { whereSql: string; params: (string | number)[] } {
  const normalized = normalizeForDb(query);
  const clauses: string[] = [];
  const params: (string | number)[] = [];

  if (category && category !== 'all') {
    clauses.push('f.category = ?');
    params.push(category);
  }
  if (scope === 'built_in') {
    clauses.push('f.is_custom = 0');
  } else if (scope === 'custom') {
    clauses.push('f.is_custom = 1');
  }
  if (normalized) {
    clauses.push(
      `(f.name_zh LIKE ? OR f.name_en LIKE ? OR f.cooking_method LIKE ? OR EXISTS (
        SELECT 1 FROM food_alias ax
        WHERE ax.food_id = f.id AND ax.normalized_alias LIKE ?
      ))`,
    );
    params.push(`%${query}%`, `%${query}%`, `%${query}%`, `%${normalized}%`);
  }

  return {
    whereSql: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
  };
}

export async function saveMeal(
  db: SQLiteDatabase,
  input: {
    eatenAt: string;
    mealType: MealType;
    title?: string;
    photoUri?: string;
    photoUris?: string[];
    notes?: string;
    items: MealItemDraft[];
  },
): Promise<number> {
  let mealId = 0;
  await db.withTransactionAsync(async () => {
    const now = new Date().toISOString();
    const title = resolveMealTitle(input.title, input.items);
    const photoUris = normalizeMealPhotoReferences(
      input.photoUris?.length ? input.photoUris : input.photoUri ? [input.photoUri] : undefined,
    );
    const result = await db.runAsync(
      `INSERT INTO meals (eaten_at, date_key, meal_type, title, photo_uri, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      input.eatenAt,
      toLocalDateKey(new Date(input.eatenAt)),
      input.mealType,
      title ?? null,
      photoUris[0] ?? null,
      input.notes ?? null,
      now,
      now,
    );
    mealId = result.lastInsertRowId;
    await insertMealPhotos(db, mealId, photoUris);
    for (const item of input.items) {
      await insertMealItem(db, mealId, item);
    }
  });
  return mealId;
}

export async function updateMealItems(
  db: SQLiteDatabase,
  mealId: number,
  items: MealItemDraft[],
): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM meal_items WHERE meal_id = ?', mealId);
    for (const item of items) {
      await insertMealItem(db, mealId, item);
    }
    await db.runAsync('UPDATE meals SET updated_at = ? WHERE id = ?', new Date().toISOString(), mealId);
  });
}

export async function updateMeal(
  db: SQLiteDatabase,
  mealId: number,
  input: {
    eatenAt: string;
    mealType: MealType;
    title?: string;
    photoUri?: string;
    photoUris?: string[];
    notes?: string;
    items: MealItemDraft[];
  },
): Promise<void> {
  await db.withTransactionAsync(async () => {
    const title = resolveMealTitle(input.title, input.items);
    const photoUris = normalizeMealPhotoReferences(
      input.photoUris?.length ? input.photoUris : input.photoUri ? [input.photoUri] : undefined,
    );
    await db.runAsync(
      `UPDATE meals
       SET eaten_at = ?, date_key = ?, meal_type = ?, title = ?, photo_uri = ?, notes = ?, updated_at = ?
       WHERE id = ?`,
      input.eatenAt,
      toLocalDateKey(new Date(input.eatenAt)),
      input.mealType,
      title ?? null,
      photoUris[0] ?? null,
      input.notes?.trim() || null,
      new Date().toISOString(),
      mealId,
    );
    await db.runAsync('DELETE FROM meal_photos WHERE meal_id = ?', mealId);
    await insertMealPhotos(db, mealId, photoUris);
    await db.runAsync('DELETE FROM meal_items WHERE meal_id = ?', mealId);
    for (const item of input.items) {
      await insertMealItem(db, mealId, item);
    }
  });
}

async function insertMealItem(
  db: SQLiteDatabase,
  mealId: number,
  item: MealItemDraft,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO meal_items
      (id, meal_id, name, weight_grams, calories, protein, carbs, fat, source,
       confidence, cooking_method, catalog_food_id, warning)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    item.id,
    mealId,
    item.name,
    item.weightGrams,
    item.calories,
    item.protein,
    item.carbs,
    item.fat,
    item.source,
    item.confidence ?? null,
    item.cookingMethod ?? null,
    item.catalogFoodId ?? null,
    item.warning ?? null,
  );
}

async function insertMealPhotos(
  db: SQLiteDatabase,
  mealId: number,
  photoUris: readonly string[],
): Promise<void> {
  for (const [index, uri] of photoUris.entries()) {
    await db.runAsync(
      `INSERT INTO meal_photos (meal_id, uri, sort_order)
       VALUES (?, ?, ?)`,
      mealId,
      uri,
      index,
    );
  }
}

export async function getMealsForDate(
  db: SQLiteDatabase,
  dateKey: string,
): Promise<MealRecord[]> {
  const meals = await db.getAllAsync<{
    id: number;
    eaten_at: string;
    meal_type: MealType;
    title: string | null;
    photo_uri: string | null;
    notes: string | null;
  }>(
    `SELECT id, eaten_at, meal_type, title, photo_uri, notes
     FROM meals WHERE date_key = ? ORDER BY eaten_at DESC`,
    dateKey,
  );

  return Promise.all(
    meals.map(async (meal) => {
      const rows = await db.getAllAsync<{
        id: string;
        name: string;
        weight_grams: number;
        calories: number;
        protein: number;
        carbs: number;
        fat: number;
        source: NutritionSource;
        confidence: number | null;
        cooking_method: string | null;
        catalog_food_id: string | null;
        warning: string | null;
      }>('SELECT * FROM meal_items WHERE meal_id = ? ORDER BY rowid', meal.id);
      const items: MealItemDraft[] = rows.map((row) => ({
        id: row.id,
        name: row.name,
        weightGrams: row.weight_grams,
        calories: row.calories,
        protein: row.protein,
        carbs: row.carbs,
        fat: row.fat,
        source: row.source,
        confidence: row.confidence ?? undefined,
        cookingMethod: row.cooking_method ?? undefined,
        catalogFoodId: row.catalog_food_id ?? undefined,
        warning: row.warning ?? undefined,
      }));
      const photoRows = await db.getAllAsync<{ uri: string }>(
        `SELECT uri FROM meal_photos
         WHERE meal_id = ?
         ORDER BY sort_order, id`,
        meal.id,
      );
      const photoUris = normalizeMealPhotoReferences(
        photoRows.length > 0
          ? photoRows.map((photo) => photo.uri)
          : meal.photo_uri
            ? [meal.photo_uri]
            : undefined,
      );
      return {
        id: meal.id,
        eatenAt: meal.eaten_at,
        mealType: meal.meal_type,
        title: meal.title ?? undefined,
        photoUri: photoUris[0],
        photoUris,
        notes: meal.notes ?? undefined,
        items,
        totals: sumMacros(items),
      };
    }),
  );
}

export async function getMealById(
  db: SQLiteDatabase,
  mealId: number,
): Promise<MealRecord | null> {
  const row = await db.getFirstAsync<{ date_key: string }>(
    'SELECT date_key FROM meals WHERE id = ?',
    mealId,
  );
  if (!row) {
    return null;
  }
  const meals = await getMealsForDate(db, row.date_key);
  return meals.find((meal) => meal.id === mealId) ?? null;
}

export async function deleteMeal(db: SQLiteDatabase, mealId: number): Promise<void> {
  await db.runAsync('DELETE FROM meals WHERE id = ?', mealId);
}

export interface DaySummary extends DailyTargets {
  dateKey: string;
}

export async function getDayTotals(
  db: SQLiteDatabase,
  dateKey: string,
): Promise<DaySummary> {
  const row = await db.getFirstAsync<DailyTargets>(
    `SELECT
      COALESCE(SUM(i.calories), 0) AS calories,
      COALESCE(SUM(i.protein), 0) AS protein,
      COALESCE(SUM(i.carbs), 0) AS carbs,
      COALESCE(SUM(i.fat), 0) AS fat
     FROM meals m
     LEFT JOIN meal_items i ON i.meal_id = m.id
     WHERE m.eaten_at >= ? AND m.eaten_at <= ?`,
    startOfLocalDayIso(dateKey),
    endOfLocalDayIso(dateKey),
  );
  return {
    dateKey,
    calories: row?.calories ?? 0,
    protein: row?.protein ?? 0,
    carbs: row?.carbs ?? 0,
    fat: row?.fat ?? 0,
  };
}

export async function getProviderConfig(
  db: SQLiteDatabase,
): Promise<AIProviderConfig | null> {
  const row = await db.getFirstAsync<{
    base_url: string;
    model: string;
    response_mode: AIProviderConfig['responseMode'];
  }>('SELECT base_url, model, response_mode FROM ai_provider_config WHERE id = 1');
  return row
    ? {
        baseUrl: row.base_url,
        model: row.model,
        responseMode: row.response_mode,
      }
    : null;
}

export async function saveProviderConfig(
  db: SQLiteDatabase,
  config: AIProviderConfig,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO ai_provider_config (id, base_url, model, response_mode, updated_at)
     VALUES (1, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
      base_url = excluded.base_url,
      model = excluded.model,
      response_mode = excluded.response_mode,
      updated_at = excluded.updated_at`,
    config.baseUrl,
    config.model,
    config.responseMode,
    new Date().toISOString(),
  );
}

export interface CachedInsightAdvice extends NutritionInsightAdvice {
  id: string;
  dataHash: string;
  updatedAt: string;
}

export interface CachedMealSuggestionAdvice extends MealSuggestionAdvice {
  id: string;
  dataHash: string;
  updatedAt: string;
}

export async function getCachedInsightAdvice(
  db: SQLiteDatabase,
  id = 'weekly',
): Promise<CachedInsightAdvice | null> {
  const row = await db.getFirstAsync<{
    id: string;
    data_hash: string;
    title: string;
    summary: string;
    actions_json: string;
    warnings_json: string;
    updated_at: string;
  }>(
    `SELECT id, data_hash, title, summary, actions_json, warnings_json, updated_at
     FROM ai_insight_advice
     WHERE id = ?`,
    id,
  );
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    dataHash: row.data_hash,
    title: row.title,
    summary: row.summary,
    actions: parseJsonStringArray(row.actions_json),
    warnings: parseJsonStringArray(row.warnings_json),
    updatedAt: row.updated_at,
  };
}

export async function saveCachedInsightAdvice(
  db: SQLiteDatabase,
  advice: Omit<CachedInsightAdvice, 'updatedAt'>,
): Promise<CachedInsightAdvice> {
  const updatedAt = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO ai_insight_advice
      (id, data_hash, title, summary, actions_json, warnings_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
      data_hash = excluded.data_hash,
      title = excluded.title,
      summary = excluded.summary,
      actions_json = excluded.actions_json,
      warnings_json = excluded.warnings_json,
      updated_at = excluded.updated_at`,
    advice.id,
    advice.dataHash,
    advice.title,
    advice.summary,
    JSON.stringify(advice.actions),
    JSON.stringify(advice.warnings),
    updatedAt,
  );
  return { ...advice, updatedAt };
}

export async function getCachedMealSuggestionAdvice(
  db: SQLiteDatabase,
  id: string,
): Promise<CachedMealSuggestionAdvice | null> {
  const row = await db.getFirstAsync<{
    id: string;
    data_hash: string;
    title: string;
    summary: string;
    actions_json: string;
    warnings_json: string;
    updated_at: string;
  }>(
    `SELECT id, data_hash, title, summary, actions_json, warnings_json, updated_at
     FROM ai_insight_advice
     WHERE id = ?`,
    id,
  );
  if (!row) {
    return null;
  }
  const payload = parseMealSuggestionPayload(row.actions_json);
  return {
    id: row.id,
    dataHash: row.data_hash,
    title: row.title,
    summary: row.summary,
    combo: payload.combo,
    alternatives: payload.alternatives,
    warnings: parseJsonStringArray(row.warnings_json),
    updatedAt: row.updated_at,
  };
}

export async function saveCachedMealSuggestionAdvice(
  db: SQLiteDatabase,
  advice: Omit<CachedMealSuggestionAdvice, 'updatedAt'>,
): Promise<CachedMealSuggestionAdvice> {
  const updatedAt = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO ai_insight_advice
      (id, data_hash, title, summary, actions_json, warnings_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
      data_hash = excluded.data_hash,
      title = excluded.title,
      summary = excluded.summary,
      actions_json = excluded.actions_json,
      warnings_json = excluded.warnings_json,
      updated_at = excluded.updated_at`,
    advice.id,
    advice.dataHash,
    advice.title,
    advice.summary,
    JSON.stringify({ combo: advice.combo, alternatives: advice.alternatives }),
    JSON.stringify(advice.warnings),
    updatedAt,
  );
  return { ...advice, updatedAt };
}

function normalizeForDb(value: string): string {
  return value.trim().toLowerCase().replace(/[\s（）()、，,·]/g, '');
}

function parseJsonStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

function parseMealSuggestionPayload(
  value: string,
): Pick<MealSuggestionAdvice, 'combo' | 'alternatives'> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed)) {
      return { combo: [], alternatives: [] };
    }
    return {
      combo: Array.isArray(parsed.combo) ? parsed.combo : [],
      alternatives: Array.isArray(parsed.alternatives) ? parsed.alternatives : [],
    };
  } catch {
    return { combo: [], alternatives: [] };
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null;
}
