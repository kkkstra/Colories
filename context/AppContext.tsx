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
import type { AIProviderConfig, DailyTargets, UserProfile } from '@/types/domain';

interface AppContextValue {
  loading: boolean;
  profile: UserProfile | null;
  targets: DailyTargets | null;
  providerConfig: AIProviderConfig | null;
  hasApiKey: boolean;
  refresh: () => Promise<void>;
  persistProfile: (profile: UserProfile, targets?: DailyTargets) => Promise<void>;
  persistTargets: (targets: DailyTargets) => Promise<void>;
  persistProvider: (config: AIProviderConfig, apiKey: string) => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: PropsWithChildren) {
  const db = useSQLiteContext();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [targets, setTargets] = useState<DailyTargets | null>(null);
  const [providerConfig, setProviderConfig] = useState<AIProviderConfig | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);

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
    },
    [db],
  );

  const persistTargets = useCallback(
    async (nextTargets: DailyTargets) => {
      await saveDefaultTargets(db, nextTargets);
      setTargets(nextTargets);
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

  const value = useMemo<AppContextValue>(
    () => ({
      loading,
      profile,
      targets,
      providerConfig,
      hasApiKey,
      refresh,
      persistProfile,
      persistTargets,
      persistProvider,
    }),
    [
      hasApiKey,
      loading,
      persistProfile,
      persistProvider,
      persistTargets,
      profile,
      providerConfig,
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
