import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-reanimated';

import { AppProvider } from '@/context/AppContext';
import { theme } from '@/constants/Theme';
import { migrateDatabase } from '@/lib/database';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

export default function RootLayout() {
  const navigationTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: theme.colors.background,
      card: theme.colors.surface,
      primary: theme.colors.primary,
      text: theme.colors.text,
      border: theme.colors.border,
    },
  };
  return (
    <SafeAreaProvider>
      <ThemeProvider value={navigationTheme}>
        <SQLiteProvider databaseName="calories.db" onInit={migrateDatabase}>
          <AppProvider>
            <Stack screenOptions={{ headerBackTitle: '返回' }}>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen
                name="onboarding"
                options={{ headerShown: false, gestureEnabled: false }}
              />
              <Stack.Screen name="edit-meal" options={{ title: '编辑记录', presentation: 'modal' }} />
              <Stack.Screen name="+not-found" options={{ title: '页面不存在' }} />
            </Stack>
            <StatusBar style="dark" />
          </AppProvider>
        </SQLiteProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
