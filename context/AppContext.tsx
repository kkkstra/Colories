import { useSQLiteContext } from 'expo-sqlite';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  getProviderConfig,
  getReminderSettings,
  getTargets,
  getUserProfile,
  saveDefaultTargets,
  saveProviderConfig,
  saveReminderSettings,
  saveUserProfile,
} from '@/lib/database';
import { calculateTargets } from '@/lib/nutrition';
import {
  getReminderPermissionStatusAsync,
  requestReminderPermissionsAsync,
  syncMealReminderNotifications,
  type ReminderPermissionStatus,
} from '@/lib/reminders';
import { DEFAULT_REMINDER_SETTINGS } from '@/lib/reminderSettings';
import { getApiKey, saveApiKey } from '@/lib/secureStorage';
import { syncTodayNutritionWidget } from '@/lib/widgetSync';
import type {
  AIProviderConfig,
  DailyTargets,
  MealItemDraft,
  ReminderSettings,
  UserProfile,
} from '@/types/domain';

export const RECORD_MEAL_ITEM_TARGET = 'record';

export function createEditMealItemTarget(mealId: number): string {
  return `edit-meal:${mealId}`;
}

interface QueuedMealItem {
  item: MealItemDraft;
  target: string;
}

interface AppContextValue {
  loading: boolean;
  profile: UserProfile | null;
  targets: DailyTargets | null;
  providerConfig: AIProviderConfig | null;
  reminderSettings: ReminderSettings;
  reminderPermissionStatus: ReminderPermissionStatus;
  hasApiKey: boolean;
  queuedMealItem: QueuedMealItem | null;
  refresh: () => Promise<void>;
  persistProfile: (profile: UserProfile, targets?: DailyTargets) => Promise<void>;
  persistTargets: (targets: DailyTargets) => Promise<void>;
  persistProvider: (config: AIProviderConfig, apiKey: string) => Promise<void>;
  persistReminderSettings: (
    settings: ReminderSettings,
    options?: { requestPermission?: boolean },
  ) => Promise<ReminderPermissionStatus>;
  queueMealItem: (item: MealItemDraft, target?: string) => void;
  clearQueuedMealItem: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: PropsWithChildren) {
  const db = useSQLiteContext();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [targets, setTargets] = useState<DailyTargets | null>(null);
  const [providerConfig, setProviderConfig] = useState<AIProviderConfig | null>(null);
  const [reminderSettings, setReminderSettings] =
    useState<ReminderSettings>(DEFAULT_REMINDER_SETTINGS);
  const [reminderPermissionStatus, setReminderPermissionStatus] =
    useState<ReminderPermissionStatus>('undetermined');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [queuedMealItem, setQueuedMealItem] = useState<QueuedMealItem | null>(null);

  const refresh = useCallback(async () => {
    const [nextProfile, nextTargets, nextProvider, nextReminderSettings, nextPermissionStatus, apiKey] = await Promise.all([
      getUserProfile(db),
      getTargets(db),
      getProviderConfig(db),
      getReminderSettings(db),
      getReminderPermissionStatusAsync(),
      getApiKey(),
    ]);
    setProfile(nextProfile);
    setTargets(nextTargets);
    setProviderConfig(nextProvider);
    setReminderSettings(nextReminderSettings);
    setReminderPermissionStatus(nextPermissionStatus);
    setHasApiKey(Boolean(apiKey));
    setLoading(false);
    syncTodayNutritionWidget(db).catch(() => {});
    syncMealReminderNotifications(nextReminderSettings).catch(() => {});
  }, [db]);

  useEffect(() => {
    refresh().catch(() => setLoading(false));
  }, [refresh]);

  const persistProfile = useCallback(
    async (nextProfile: UserProfile, customTargets?: DailyTargets) => {
      const nextTargets = customTargets ?? calculateTargets(nextProfile);
      await db.withTransactionAsync(async () => {
        await saveUserProfile(db, nextProfile);
        await saveDefaultTargets(db, nextTargets);
      });
      setProfile(nextProfile);
      setTargets(nextTargets);
      syncTodayNutritionWidget(db).catch(() => {});
    },
    [db],
  );

  const persistTargets = useCallback(
    async (nextTargets: DailyTargets) => {
      await saveDefaultTargets(db, nextTargets);
      setTargets(nextTargets);
      syncTodayNutritionWidget(db).catch(() => {});
    },
    [db],
  );

  const persistProvider = useCallback(
    async (config: AIProviderConfig, apiKey: string) => {
      await Promise.all([saveProviderConfig(db, config), saveApiKey(apiKey)]);
      setProviderConfig(config);
      setHasApiKey(true);
    },
    [db],
  );

  const persistReminderSettings = useCallback(
    async (
      nextSettings: ReminderSettings,
      options: { requestPermission?: boolean } = {},
    ): Promise<ReminderPermissionStatus> => {
      let nextPermissionStatus = await getReminderPermissionStatusAsync();
      if (nextSettings.enabled && options.requestPermission) {
        nextPermissionStatus = await requestReminderPermissionsAsync();
      }
      await saveReminderSettings(db, nextSettings);
      setReminderSettings(nextSettings);
      setReminderPermissionStatus(nextPermissionStatus);
      await syncMealReminderNotifications(nextSettings);
      return nextPermissionStatus;
    },
    [db],
  );

  const queueMealItem = useCallback((item: MealItemDraft, target = RECORD_MEAL_ITEM_TARGET) => {
    setQueuedMealItem({ item, target });
  }, []);

  const clearQueuedMealItem = useCallback(() => {
    setQueuedMealItem(null);
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      loading,
      profile,
      targets,
      providerConfig,
      reminderSettings,
      reminderPermissionStatus,
      hasApiKey,
      queuedMealItem,
      refresh,
      persistProfile,
      persistTargets,
      persistProvider,
      persistReminderSettings,
      queueMealItem,
      clearQueuedMealItem,
    }),
    [
      clearQueuedMealItem,
      hasApiKey,
      loading,
      persistProfile,
      persistProvider,
      persistReminderSettings,
      persistTargets,
      profile,
      providerConfig,
      queueMealItem,
      queuedMealItem,
      reminderPermissionStatus,
      reminderSettings,
      refresh,
      targets,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) {
    throw new Error('useApp must be used inside AppProvider');
  }
  return value;
}
