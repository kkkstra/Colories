import Ionicons from '@expo/vector-icons/Ionicons';
import { DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-reanimated';

import { AppProvider } from '@/context/AppContext';
import { theme } from '@/constants/Theme';
import { migrateDatabase } from '@/lib/database';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

function HeaderBackButton() {
  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/');
  };

  return (
    <Pressable
      accessibilityLabel="返回上一页"
      accessibilityRole="button"
      hitSlop={10}
      onPress={handleBack}
      style={({ pressed }) => [styles.headerBackButton, pressed && styles.pressed]}
    >
      <Ionicons name="chevron-back" size={24} color={theme.colors.primary} />
    </Pressable>
  );
}

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
            <Stack
              screenOptions={{
                headerBackVisible: false,
                headerLeft: () => <HeaderBackButton />,
                headerShadowVisible: false,
                headerStyle: { backgroundColor: theme.colors.background },
                headerTitleAlign: 'center',
                headerTitleStyle: styles.headerTitle,
              }}
            >
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen
                name="onboarding"
                options={{ headerShown: false, gestureEnabled: false }}
              />
              <Stack.Screen name="food-library" options={{ title: '食物库' }} />
              <Stack.Screen name="edit-food" options={{ title: '食物' }} />
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

const styles = StyleSheet.create({
  headerBackButton: {
    width: 42,
    height: 42,
    marginLeft: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(39, 93, 255, 0.16)',
    backgroundColor: theme.colors.primarySoft,
  },
  headerTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0,
  },
  pressed: {
    opacity: 0.72,
    transform: [{ translateY: 1 }],
  },
});
