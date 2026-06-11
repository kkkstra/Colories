import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-reanimated';

import { AppHeader } from '@/components/ui/AppHeader';
import { AppProvider } from '@/context/AppContext';
import { theme } from '@/constants/Theme';
import { migrateDatabase } from '@/lib/database';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

const COMPACT_HEADER_ROUTES = new Set(['select-food', 'edit-food', 'edit-meal']);

export default function RootLayout() {
  const navigationTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: theme.colors.background,
      card: theme.colors.surfaceRaised,
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
            <Stack
              screenOptions={{
                header: ({ options, route }) => (
                  <AppHeader
                    title={resolveHeaderTitle(options)}
                    compactTopInset={COMPACT_HEADER_ROUTES.has(route.name)}
                  />
                ),
              }}
            >
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen
                name="onboarding"
                options={{ headerShown: false, gestureEnabled: false }}
              />
              <Stack.Screen name="food-library" options={{ title: '食物库' }} />
              <Stack.Screen name="edit-food" options={{ title: '食物', presentation: 'modal' }} />
              <Stack.Screen name="select-food" options={{ title: '添加食物', presentation: 'modal' }} />
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

function resolveHeaderTitle(options: { title?: string; headerTitle?: unknown }): string | undefined {
  return typeof options.headerTitle === 'string' ? options.headerTitle : options.title;
}
