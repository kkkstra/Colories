import { Directory, File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { DATABASE_VERSION } from '@/lib/database';
import {
  MEAL_PHOTO_DIRECTORY,
  createMealPhotoReference,
  extractMealPhotoReference,
  joinDocumentPhotoUri,
} from '@/lib/photoReference';
import { createLocalId } from '@/lib/security';
import type { AIProviderConfig, FoodCategory, MealType, NutritionSource } from '@/types/domain';

export const BACKUP_APP_ID = 'com.patrick.caloriesai';
export const BACKUP_SCHEMA_VERSION = 1;

export type ImportMode = 'replace' | 'merge';

type DbValue = string | number | null;

type QueryableDatabase = Pick<SQLiteDatabase, 'getAllAsync' | 'getFirstAsync' | 'runAsync'>;

type TransferDatabase = QueryableDatabase &
  Pick<SQLiteDatabase, 'withTransactionAsync'> &
  Partial<Pick<SQLiteDatabase, 'withExclusiveTransactionAsync'>>;

type UserProfileRow = {
  id: number;
  age: number;
  height_cm: number;
  weight_kg: number;
  sex: string;
  activity_level: string;
  goal: string;
  updated_at: string;
};

type DailyTargetRow = {
  date_key: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  updated_at: string;
};

type FoodCatalogRow = {
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
  updated_at: string;
};

type FoodAliasRow = {
  alias: string;
  normalized_alias: string;
  food_id: string;
};

type MealRow = {
  id: number;
  eaten_at: string;
  date_key: string;
  meal_type: MealType;
  title: string | null;
  photo_uri: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type MealItemRow = {
  id: string;
  meal_id: number;
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
};

type MealPhotoRow = {
  id: number;
  meal_id: number;
  uri: string;
  sort_order: number;
};

type AIProviderConfigRow = {
  id: number;
  base_url: string;
  model: string;
  response_mode: AIProviderConfig['responseMode'];
  updated_at: string;
};

type AIInsightAdviceRow = {
  id: string;
  data_hash: string;
  title: string;
  summary: string;
  actions_json: string;
  warnings_json: string;
  updated_at: string;
};

export type BackupPhoto = {
  reference: string;
  mediaType: 'image/jpeg';
  base64: string;
};

export type CaloriesBackupV1 = {
  appId: typeof BACKUP_APP_ID;
  schemaVersion: typeof BACKUP_SCHEMA_VERSION;
  databaseVersion: number;
  exportedAt: string;
  data: {
    userProfile: UserProfileRow[];
    dailyTargets: DailyTargetRow[];
    customFoods: FoodCatalogRow[];
    foodAliases: FoodAliasRow[];
    meals: MealRow[];
    mealItems: MealItemRow[];
    mealPhotos: MealPhotoRow[];
    aiProviderConfig: AIProviderConfigRow[];
    aiInsightAdvice: AIInsightAdviceRow[];
    photos: BackupPhoto[];
  };
};

export type DataExportResult = {
  uri: string;
  fileName: string;
  stats: {
    meals: number;
    customFoods: number;
    photos: number;
    skippedPhotos: number;
  };
};

export type DataImportResult = {
  mode: ImportMode;
  meals: number;
  customFoods: number;
  photosRestored: number;
  photosSkipped: number;
};

type PhotoPlan = {
  map: Map<string, string>;
  writes: { reference: string; photo: BackupPhoto }[];
  skipped: number;
};

export async function createDataExportFile(db: TransferDatabase): Promise<DataExportResult> {
  const { backup, skippedPhotos } = await createCaloriesBackup(db);
  const fileName = `calories-backup-${backup.exportedAt.slice(0, 10)}.calories-backup.json`;
  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true });
  file.write(JSON.stringify(backup, null, 2));
  return {
    uri: file.uri,
    fileName,
    stats: {
      meals: backup.data.meals.length,
      customFoods: backup.data.customFoods.length,
      photos: backup.data.photos.length,
      skippedPhotos,
    },
  };
}

export async function createCaloriesBackup(
  db: QueryableDatabase,
): Promise<{ backup: CaloriesBackupV1; skippedPhotos: number }> {
  const [
    userProfile,
    dailyTargets,
    customFoods,
    foodAliases,
    meals,
    mealItems,
    mealPhotos,
    aiProviderConfig,
    aiInsightAdvice,
  ] = await Promise.all([
    db.getAllAsync<UserProfileRow>('SELECT * FROM user_profile ORDER BY id'),
    db.getAllAsync<DailyTargetRow>('SELECT * FROM daily_targets ORDER BY date_key'),
    db.getAllAsync<FoodCatalogRow>(
      'SELECT * FROM food_catalog WHERE is_custom = 1 ORDER BY updated_at, id',
    ),
    db.getAllAsync<FoodAliasRow>(
      `SELECT a.*
       FROM food_alias a
       JOIN food_catalog f ON f.id = a.food_id
       WHERE f.is_custom = 1
       ORDER BY a.food_id, a.alias`,
    ),
    db.getAllAsync<MealRow>('SELECT * FROM meals ORDER BY eaten_at, id'),
    db.getAllAsync<MealItemRow>('SELECT * FROM meal_items ORDER BY meal_id, rowid'),
    db.getAllAsync<MealPhotoRow>('SELECT * FROM meal_photos ORDER BY meal_id, sort_order, id'),
    db.getAllAsync<AIProviderConfigRow>('SELECT * FROM ai_provider_config ORDER BY id'),
    db.getAllAsync<AIInsightAdviceRow>('SELECT * FROM ai_insight_advice ORDER BY id'),
  ]);

  const { photos, skippedPhotos } = await readBackupPhotos(meals, mealPhotos);

  return {
    backup: {
      appId: BACKUP_APP_ID,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      databaseVersion: DATABASE_VERSION,
      exportedAt: new Date().toISOString(),
      data: {
        userProfile,
        dailyTargets,
        customFoods,
        foodAliases,
        meals,
        mealItems,
        mealPhotos,
        aiProviderConfig,
        aiInsightAdvice,
        photos,
      },
    },
    skippedPhotos,
  };
}

export async function importDataFile(
  db: TransferDatabase,
  uri: string,
  mode: ImportMode,
): Promise<DataImportResult> {
  const file = new File(uri);
  return importDataText(db, await file.text(), mode);
}

export async function importDataText(
  db: TransferDatabase,
  text: string,
  mode: ImportMode,
): Promise<DataImportResult> {
  const backup = parseCaloriesBackup(text);
  return importCaloriesBackup(db, backup, mode);
}

export async function importCaloriesBackup(
  db: TransferDatabase,
  backup: CaloriesBackupV1,
  mode: ImportMode,
): Promise<DataImportResult> {
  const photoPlan = buildPhotoPlan(backup, mode);
  let customFoods = 0;
  let meals = 0;

  await runImportTransaction(db, async (txn) => {
    const foodIdMap = new Map<string, string>();
    const mealIdMap = new Map<number, number>();

    if (mode === 'replace') {
      await clearUserData(txn);
    }

    await importScalarRows(txn, backup, mode);
    customFoods = await importCustomFoods(txn, backup, mode, foodIdMap);
    meals = await importMeals(txn, backup, mode, mealIdMap, foodIdMap, photoPlan.map);
  });

  const photoStats = await restorePlannedPhotos(photoPlan, mode);

  return {
    mode,
    meals,
    customFoods,
    photosRestored: photoStats.restored,
    photosSkipped: photoPlan.skipped + photoStats.skipped,
  };
}

export async function resetAllAppData(db: TransferDatabase): Promise<void> {
  await runImportTransaction(db, async (txn) => {
    await clearUserData(txn);
  });
  clearStoredPhotos();
}

export function parseCaloriesBackup(text: string): CaloriesBackupV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('备份文件不是有效的 JSON。');
  }
  if (!isRecord(parsed)) {
    throw new Error('备份文件格式不正确。');
  }
  if (parsed.appId !== BACKUP_APP_ID) {
    throw new Error('这不是燃卡的数据备份文件。');
  }
  if (parsed.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    throw new Error('备份格式版本不受支持。');
  }
  if (typeof parsed.databaseVersion !== 'number' || parsed.databaseVersion > DATABASE_VERSION) {
    throw new Error('备份来自更新版本的应用，请先升级当前应用。');
  }
  if (!isRecord(parsed.data)) {
    throw new Error('备份文件缺少数据内容。');
  }

  for (const key of [
    'userProfile',
    'dailyTargets',
    'customFoods',
    'foodAliases',
    'meals',
    'mealItems',
    'mealPhotos',
    'aiProviderConfig',
    'aiInsightAdvice',
    'photos',
  ]) {
    if (!Array.isArray(parsed.data[key])) {
      throw new Error('备份文件数据结构不完整。');
    }
  }

  return parsed as CaloriesBackupV1;
}

async function readBackupPhotos(
  meals: readonly MealRow[],
  mealPhotos: readonly MealPhotoRow[],
): Promise<{ photos: BackupPhoto[]; skippedPhotos: number }> {
  const references = new Set<string>();
  for (const uri of [
    ...meals.map((meal) => meal.photo_uri),
    ...mealPhotos.map((photo) => photo.uri),
  ]) {
    const reference = uri ? extractMealPhotoReference(uri) : undefined;
    if (reference) {
      references.add(reference);
    }
  }

  const photos: BackupPhoto[] = [];
  let skippedPhotos = 0;
  for (const reference of references) {
    try {
      const file = new File(joinDocumentPhotoUri(Paths.document.uri, reference));
      if (!file.exists) {
        skippedPhotos += 1;
        continue;
      }
      photos.push({
        reference,
        mediaType: 'image/jpeg',
        base64: await file.base64(),
      });
    } catch {
      skippedPhotos += 1;
    }
  }
  return { photos, skippedPhotos };
}

function buildPhotoPlan(backup: CaloriesBackupV1, mode: ImportMode): PhotoPlan {
  const map = new Map<string, string>();
  const writes: PhotoPlan['writes'] = [];
  let skipped = 0;

  for (const photo of backup.data.photos) {
    const reference = extractMealPhotoReference(photo.reference);
    if (!reference || !photo.base64) {
      skipped += 1;
      continue;
    }

    const nextReference =
      mode === 'replace' ? reference : createImportedPhotoReference(reference);
    map.set(reference, Platform.OS === 'web' ? toDataUri(photo) : nextReference);
    if (Platform.OS !== 'web') {
      writes.push({ reference: nextReference, photo: { ...photo, reference } });
    }
  }

  return { map, writes, skipped };
}

async function restorePlannedPhotos(
  plan: PhotoPlan,
  mode: ImportMode,
): Promise<{ restored: number; skipped: number }> {
  if (Platform.OS === 'web') {
    return { restored: plan.map.size, skipped: 0 };
  }

  if (mode === 'replace') {
    resetPhotoDirectory();
  } else {
    ensurePhotoDirectory();
  }

  let restored = 0;
  let skipped = 0;
  for (const write of plan.writes) {
    try {
      const fileName = write.reference.split('/').pop();
      if (!fileName) {
        skipped += 1;
        continue;
      }
      const file = new File(new Directory(Paths.document, MEAL_PHOTO_DIRECTORY), fileName);
      file.create({ overwrite: true });
      file.write(base64ToBytes(write.photo.base64));
      restored += 1;
    } catch {
      skipped += 1;
    }
  }
  return { restored, skipped };
}

function resetPhotoDirectory(): void {
  const directory = new Directory(Paths.document, MEAL_PHOTO_DIRECTORY);
  if (directory.exists) {
    directory.delete();
  }
  directory.create({ idempotent: true, intermediates: true });
}

function clearStoredPhotos(): void {
  if (Platform.OS === 'web') {
    return;
  }
  try {
    resetPhotoDirectory();
  } catch {
    // Photo cleanup should not block resetting app data.
  }
}

function ensurePhotoDirectory(): void {
  new Directory(Paths.document, MEAL_PHOTO_DIRECTORY).create({
    idempotent: true,
    intermediates: true,
  });
}

async function runImportTransaction(
  db: TransferDatabase,
  task: (txn: QueryableDatabase) => Promise<void>,
): Promise<void> {
  if (Platform.OS !== 'web' && typeof db.withExclusiveTransactionAsync === 'function') {
    await db.withExclusiveTransactionAsync(async (txn) => task(txn));
    return;
  }
  await db.withTransactionAsync(async () => task(db));
}

async function clearUserData(db: QueryableDatabase): Promise<void> {
  await db.runAsync('DELETE FROM meal_photos');
  await db.runAsync('DELETE FROM meal_items');
  await db.runAsync('DELETE FROM meals');
  await db.runAsync('DELETE FROM ai_insight_advice');
  await db.runAsync('DELETE FROM ai_provider_config');
  await db.runAsync('DELETE FROM daily_targets');
  await db.runAsync('DELETE FROM user_profile');
  await db.runAsync(
    `DELETE FROM food_alias
     WHERE food_id IN (SELECT id FROM food_catalog WHERE is_custom = 1)`,
  );
  await db.runAsync('DELETE FROM food_catalog WHERE is_custom = 1');
}

async function importScalarRows(
  db: QueryableDatabase,
  backup: CaloriesBackupV1,
  mode: ImportMode,
): Promise<void> {
  if (mode === 'merge') {
    return;
  }

  for (const row of backup.data.userProfile) {
    await db.runAsync(
      `INSERT INTO user_profile
        (id, age, height_cm, weight_kg, sex, activity_level, goal, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      rowParams(row, [
        'id',
        'age',
        'height_cm',
        'weight_kg',
        'sex',
        'activity_level',
        'goal',
        'updated_at',
      ]),
    );
  }
  for (const row of backup.data.dailyTargets) {
    await db.runAsync(
      `INSERT INTO daily_targets
        (date_key, calories, protein, carbs, fat, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      rowParams(row, ['date_key', 'calories', 'protein', 'carbs', 'fat', 'updated_at']),
    );
  }
  for (const row of backup.data.aiProviderConfig) {
    await db.runAsync(
      `INSERT INTO ai_provider_config
        (id, base_url, model, response_mode, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      rowParams(row, ['id', 'base_url', 'model', 'response_mode', 'updated_at']),
    );
  }
  for (const row of backup.data.aiInsightAdvice) {
    await db.runAsync(
      `INSERT INTO ai_insight_advice
        (id, data_hash, title, summary, actions_json, warnings_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      rowParams(row, [
        'id',
        'data_hash',
        'title',
        'summary',
        'actions_json',
        'warnings_json',
        'updated_at',
      ]),
    );
  }
}

async function importCustomFoods(
  db: QueryableDatabase,
  backup: CaloriesBackupV1,
  mode: ImportMode,
  foodIdMap: Map<string, string>,
): Promise<number> {
  let imported = 0;

  for (const row of backup.data.customFoods) {
    let nextId = row.id;
    if (mode === 'merge') {
      const existing = await db.getFirstAsync<FoodCatalogRow>(
        'SELECT * FROM food_catalog WHERE id = ?',
        row.id,
      );
      if (existing && !isSameCustomFood(existing, row)) {
        nextId = createLocalId('custom-food');
      }
    }
    foodIdMap.set(row.id, nextId);
    await insertCustomFoodRow(db, { ...row, id: nextId, is_custom: 1 });
    imported += 1;
  }

  for (const row of backup.data.foodAliases) {
    const foodId = foodIdMap.get(row.food_id) ?? row.food_id;
    await db.runAsync(
      `INSERT OR IGNORE INTO food_alias (alias, normalized_alias, food_id)
       VALUES (?, ?, ?)`,
      [row.alias, row.normalized_alias, foodId],
    );
  }

  return imported;
}

async function insertCustomFoodRow(db: QueryableDatabase, row: FoodCatalogRow): Promise<void> {
  await db.runAsync(
    `INSERT INTO food_catalog
      (id, name_zh, name_en, category, cooking_method, calories, protein, carbs, fat,
       source_reference, is_custom, updated_at)
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
    rowParams(row, [
      'id',
      'name_zh',
      'name_en',
      'category',
      'cooking_method',
      'calories',
      'protein',
      'carbs',
      'fat',
      'source_reference',
      'updated_at',
    ]),
  );
}

async function importMeals(
  db: QueryableDatabase,
  backup: CaloriesBackupV1,
  mode: ImportMode,
  mealIdMap: Map<number, number>,
  foodIdMap: Map<string, string>,
  photoMap: Map<string, string>,
): Promise<number> {
  for (const row of backup.data.meals) {
    if (mode === 'replace') {
      await db.runAsync(
        `INSERT INTO meals
          (id, eaten_at, date_key, meal_type, title, photo_uri, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.eaten_at,
          row.date_key,
          row.meal_type,
          row.title,
          mapPhotoUri(row.photo_uri, photoMap),
          row.notes,
          row.created_at,
          row.updated_at,
        ],
      );
      mealIdMap.set(row.id, row.id);
      continue;
    }

    const result = await db.runAsync(
      `INSERT INTO meals
        (eaten_at, date_key, meal_type, title, photo_uri, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.eaten_at,
        row.date_key,
        row.meal_type,
        row.title,
        mapPhotoUri(row.photo_uri, photoMap),
        row.notes,
        row.created_at,
        row.updated_at,
      ],
    );
    mealIdMap.set(row.id, result.lastInsertRowId);
  }

  for (const row of backup.data.mealItems) {
    const mealId = mealIdMap.get(row.meal_id);
    if (!mealId) {
      continue;
    }
    await db.runAsync(
      `INSERT INTO meal_items
        (id, meal_id, name, weight_grams, calories, protein, carbs, fat, source,
         confidence, cooking_method, catalog_food_id, warning)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        mode === 'replace' ? row.id : createLocalId('item'),
        mealId,
        row.name,
        row.weight_grams,
        row.calories,
        row.protein,
        row.carbs,
        row.fat,
        row.source,
        row.confidence,
        row.cooking_method,
        row.catalog_food_id ? foodIdMap.get(row.catalog_food_id) ?? row.catalog_food_id : null,
        row.warning,
      ],
    );
  }

  for (const row of backup.data.mealPhotos) {
    const mealId = mealIdMap.get(row.meal_id);
    if (!mealId) {
      continue;
    }
    await db.runAsync(
      `INSERT INTO meal_photos (meal_id, uri, sort_order)
       VALUES (?, ?, ?)`,
      [mealId, mapPhotoUri(row.uri, photoMap), row.sort_order],
    );
  }

  return mealIdMap.size;
}

function mapPhotoUri(uri: string | null, photoMap: Map<string, string>): string | null {
  if (!uri) {
    return null;
  }
  const reference = extractMealPhotoReference(uri);
  return reference ? photoMap.get(reference) ?? reference : uri;
}

function createImportedPhotoReference(reference: string): string {
  const extension = reference.match(/\.[a-zA-Z0-9]+$/)?.[0] ?? '.jpg';
  return createMealPhotoReference(`${createLocalId('backup-photo')}${extension}`);
}

function isSameCustomFood(left: FoodCatalogRow, right: FoodCatalogRow): boolean {
  return (
    left.name_zh === right.name_zh &&
    left.name_en === right.name_en &&
    left.category === right.category &&
    left.cooking_method === right.cooking_method &&
    left.calories === right.calories &&
    left.protein === right.protein &&
    left.carbs === right.carbs &&
    left.fat === right.fat &&
    left.source_reference === right.source_reference &&
    left.is_custom === 1 &&
    right.is_custom === 1
  );
}

function toDataUri(photo: BackupPhoto): string {
  return `data:${photo.mediaType};base64,${photo.base64}`;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function rowParams<T extends object, K extends keyof T>(
  row: T,
  keys: readonly K[],
): DbValue[] {
  return keys.map((key) => row[key] as DbValue);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
