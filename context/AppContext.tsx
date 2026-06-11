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
  getTargets,
  getUserProfile,
  saveDefaultTargets,
  saveProviderConfig,
  saveUserProfile,
} from '@/lib/database';
import { calculateTargets } from '@/lib/nutrition';
import { getApiKey, saveApiKey } from '@/lib/secureStorage';
import { syncTodayNutritionWidget } from '@/lib/widgetSync';
import type { AIProviderConfig, DailyTargets, MealItemDraft, UserProfile } from '@/types/domain';

interface AppContextValue {
  loading: boolean;
  profile: UserProfile | null;
  targets: DailyTargets | null;
  providerConfig: AIProviderConfig | null;
  hasApiKey: boolean;
  queuedMealItem: MealItemDraft | null;
  refresh: () => Promise<void>;
  persistProfile: (profile: UserProfile, targets?: DailyTargets) => Promise<void>;
  persistTargets: (targets: DailyTargets) => Promise<void>;
  persistProvider: (config: AIProviderConfig, apiKey: string) => Promise<void>;
  queueMealItem: (item: MealItemDraft) => void;
  clearQueuedMealItem: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: PropsWithChildren) {
  const db = useSQLiteContext();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [targets, setTargets] = useState<DailyTargets | null>(null);
  const [providerConfig, setProviderConfig] = useState<AIProviderConfig | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [queuedMealItem, setQueuedMealItem] = useState<MealItemDraft | null>(null);

  const refresh = useCallback(async () => {
    const [nextProfile, nextTargets, nextProvider, apiKey] = await Promise.all([
      getUserProfile(db),
      getTargets(db),
      getProviderConfig(db),
      getApiKey(),
    ]);
    setProfile(nextProfile);
    setTargets(nextTargets);
    setProviderConfig(nextProvider);
    setHasApiKey(Boolean(apiKey));
    setLoading(false);
    syncTodayNutritionWidget(db).catch(() => {});
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

  const queueMealItem = useCallback((item: MealItemDraft) => {
    setQueuedMealItem(item);
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
      hasApiKey,
      queuedMealItem,
      refresh,
      persistProfile,
      persistTargets,
      persistProvider,
      queueMealItem,
      clearQueuedMealItem,
    }),
    [
      clearQueuedMealItem,
      hasApiKey,
      loading,
      persistProfile,
      persistProvider,
      persistTargets,
      profile,
      providerConfig,
      queueMealItem,
      queuedMealItem,
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
