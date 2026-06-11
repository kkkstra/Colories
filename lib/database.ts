import type { SQLiteDatabase } from 'expo-sqlite';

import { FOOD_CATALOG } from '@/data/foodCatalog';
import { endOfLocalDayIso, startOfLocalDayIso, toLocalDateKey } from '@/lib/date';
import { resolveMealTitle } from '@/lib/mealTitle';
import { sumMacros } from '@/lib/nutrition';
import { normalizeMealPhotoReference } from '@/lib/photoReference';
import { createLocalId } from '@/lib/security';
import type {
  AIProviderConfig,
  DailyTargets,
  FoodCategory,
  MacroValues,
  MealItemDraft,
  MealRecord,
  MealType,
  NutritionSource,
  UserProfile,
} from '@/types/domain';

export const DATABASE_VERSION = 3;

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
          (id, name_zh, name_en, category, calories, protein, carbs, fat, source_reference, is_custom, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        food.id,
        food.nameZh,
        food.nameEn ?? null,
        food.category,
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

export interface CatalogSearchRow {
  id: string;
  nameZh: string;
  nameEn?: string;
  category: FoodCategory;
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
  aliases?: string[];
  sourceReference?: string;
};

type FoodCatalogDbRow = {
  id: string;
  name_zh: string;
  name_en: string | null;
  category: FoodCategory;
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
         WHERE a.normalized_alias LIKE ? OR f.name_zh LIKE ? OR f.name_en LIKE ?
         ORDER BY CASE WHEN a.normalized_alias = ? THEN 0 ELSE 1 END, f.is_custom DESC, f.name_zh
         LIMIT ?`
      : `SELECT * FROM food_catalog ORDER BY is_custom DESC, category, name_zh LIMIT ?`,
    ...(normalized
      ? [`%${normalized}%`, `%${query}%`, `%${query}%`, normalized, limit]
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
        (id, name_zh, name_en, category, calories, protein, carbs, fat, source_reference, is_custom, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
       ON CONFLICT(id) DO UPDATE SET
        name_zh = excluded.name_zh,
        name_en = excluded.name_en,
        category = excluded.category,
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
      `(f.name_zh LIKE ? OR f.name_en LIKE ? OR EXISTS (
        SELECT 1 FROM food_alias ax
        WHERE ax.food_id = f.id AND ax.normalized_alias LIKE ?
      ))`,
    );
    params.push(`%${query}%`, `%${query}%`, `%${normalized}%`);
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
    notes?: string;
    items: MealItemDraft[];
  },
): Promise<number> {
  let mealId = 0;
  await db.withTransactionAsync(async () => {
    const now = new Date().toISOString();
    const title = resolveMealTitle(input.title, input.items);
    const result = await db.runAsync(
      `INSERT INTO meals (eaten_at, date_key, meal_type, title, photo_uri, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      input.eatenAt,
      toLocalDateKey(new Date(input.eatenAt)),
      input.mealType,
      title ?? null,
      normalizeMealPhotoReference(input.photoUri) ?? null,
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

export async function updateMeal(
  db: SQLiteDatabase,
  mealId: number,
  input: {
    eatenAt: string;
    mealType: MealType;
    title?: string;
    notes?: string;
    items: MealItemDraft[];
  },
): Promise<void> {
  await db.withTransactionAsync(async () => {
    const title = resolveMealTitle(input.title, input.items);
    await db.runAsync(
      `UPDATE meals
       SET eaten_at = ?, date_key = ?, meal_type = ?, title = ?, notes = ?, updated_at = ?
       WHERE id = ?`,
      input.eatenAt,
      toLocalDateKey(new Date(input.eatenAt)),
      input.mealType,
      title ?? null,
      input.notes?.trim() || null,
      new Date().toISOString(),
      mealId,
    );
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
      return {
        id: meal.id,
        eatenAt: meal.eaten_at,
        mealType: meal.meal_type,
        title: meal.title ?? undefined,
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
