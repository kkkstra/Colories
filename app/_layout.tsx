import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-reanimated';

import { AppProvider } from '@/context/AppContext';
import { migrateDatabase } from '@/lib/database';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <SafeAreaProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
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
