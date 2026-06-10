import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const API_KEY_STORAGE_KEY = 'ai_provider_api_key';

export async function getApiKey(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(API_KEY_STORAGE_KEY);
  }
  return SecureStore.getItemAsync(API_KEY_STORAGE_KEY);
}

export async function saveApiKey(apiKey: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
    return;
  }
  await SecureStore.setItemAsync(API_KEY_STORAGE_KEY, apiKey, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function clearApiKey(): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(API_KEY_STORAGE_KEY);
}
