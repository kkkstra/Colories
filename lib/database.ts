import type { SQLiteDatabase } from 'expo-sqlite';

import { FOOD_CATALOG } from '@/data/foodCatalog';
import { endOfLocalDayIso, startOfLocalDayIso, toLocalDateKey } from '@/lib/date';
import { sumMacros } from '@/lib/nutrition';
import type {
  AIProviderConfig,
  DailyTargets,
  MealItemDraft,
  MealRecord,
  MealType,
  NutritionSource,
  UserProfile,
} from '@/types/domain';

export const DATABASE_VERSION = 1;

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

export async function migrateDatabase(db: SQLiteDatabase): Promise<void> {
  const versionRow = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = versionRow?.user_version ?? 0;
  if (currentVersion < 1) {
    await db.execAsync(MIGRATION_V1_SQL);
    await seedFoodCatalog(db);
  }
  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}

async function seedFoodCatalog(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM food_catalog');
  if ((row?.count ?? 0) >= FOOD_CATALOG.length) {
    return;
  }

  await db.withTransactionAsync(async () => {
    for (const food of FOOD_CATALOG) {
      await db.runAsync(
        `INSERT OR REPLACE INTO food_catalog
          (id, name_zh, name_en, category, calories, protein, carbs, fat, source_reference)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        food.id,
        food.nameZh,
        food.nameEn ?? null,
        food.category,
        food.calories,
        food.protein,
        food.carbs,
        food.fat,
        food.sourceReference,
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

export interface CatalogSearchRow {
  id: string;
  nameZh: string;
  nameEn?: string;
  category: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  sourceReference: string;
}

export async function searchFoods(
  db: SQLiteDatabase,
  query: string,
  limit = 20,
): Promise<CatalogSearchRow[]> {
  const normalized = normalizeForDb(query);
  const rows = await db.getAllAsync<{
    id: string;
    name_zh: string;
    name_en: string | null;
    category: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    source_reference: string;
  }>(
    normalized
      ? `SELECT DISTINCT f.*
         FROM food_catalog f
         LEFT JOIN food_alias a ON a.food_id = f.id
         WHERE a.normalized_alias LIKE ? OR f.name_zh LIKE ? OR f.name_en LIKE ?
         ORDER BY CASE WHEN a.normalized_alias = ? THEN 0 ELSE 1 END, f.name_zh
         LIMIT ?`
      : `SELECT * FROM food_catalog ORDER BY category, name_zh LIMIT ?`,
    ...(normalized
      ? [`%${normalized}%`, `%${query}%`, `%${query}%`, normalized, limit]
      : [limit]),
  );
  return rows.map((row) => ({
    id: row.id,
    nameZh: row.name_zh,
    nameEn: row.name_en ?? undefined,
    category: row.category,
    calories: row.calories,
    protein: row.protein,
    carbs: row.carbs,
    fat: row.fat,
    sourceReference: row.source_reference,
  }));
}

export async function findFoodMatch(
  db: SQLiteDatabase,
  name: string,
): Promise<CatalogSearchRow | null> {
  const normalized = normalizeForDb(name);
  const row = await db.getFirstAsync<{
    id: string;
    name_zh: string;
    name_en: string | null;
    category: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    source_reference: string;
  }>(
    `SELECT f.*
     FROM food_catalog f
     JOIN food_alias a ON a.food_id = f.id
     WHERE a.normalized_alias = ?
     ORDER BY CASE WHEN f.name_zh = ? THEN 0 ELSE 1 END
     LIMIT 1`,
    normalized,
    name,
  );
  return row
    ? {
        id: row.id,
        nameZh: row.name_zh,
        nameEn: row.name_en ?? undefined,
        category: row.category,
        calories: row.calories,
        protein: row.protein,
        carbs: row.carbs,
        fat: row.fat,
        sourceReference: row.source_reference,
      }
    : null;
}

export async function saveMeal(
  db: SQLiteDatabase,
  input: {
    eatenAt: string;
    mealType: MealType;
    photoUri?: string;
    notes?: string;
    items: MealItemDraft[];
  },
): Promise<number> {
  let mealId = 0;
  await db.withTransactionAsync(async () => {
    const now = new Date().toISOString();
    const result = await db.runAsync(
      `INSERT INTO meals (eaten_at, date_key, meal_type, photo_uri, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      input.eatenAt,
      toLocalDateKey(new Date(input.eatenAt)),
      input.mealType,
      input.photoUri ?? null,
      input.notes ?? null,
      now,
      now,
    );
    mealId = result.lastInsertRowId;
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

export async function getMealsForDate(
  db: SQLiteDatabase,
  dateKey: string,
): Promise<MealRecord[]> {
  const meals = await db.getAllAsync<{
    id: number;
    eaten_at: string;
    meal_type: MealType;
    photo_uri: string | null;
    notes: string | null;
  }>(
    `SELECT id, eaten_at, meal_type, photo_uri, notes
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
      return {
        id: meal.id,
        eatenAt: meal.eaten_at,
        mealType: meal.meal_type,
        photoUri: meal.photo_uri ?? undefined,
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

function normalizeForDb(value: string): string {
  return value.trim().toLowerCase().replace(/[\s（）()、，,·]/g, '');
}
