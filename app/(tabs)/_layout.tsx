import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';

import { theme } from '@/constants/Theme';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: {
          height: 72,
          paddingTop: 8,
          paddingBottom: 10,
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '800',
          letterSpacing: 0.3,
        },
        tabBarItemStyle: {
          paddingTop: 2,
        },
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '今日',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="today-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="record"
        options={{
          title: '记录',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="add-circle" color={color} size={size + 5} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: '历史',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '设置',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
