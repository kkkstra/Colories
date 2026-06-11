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
        tabBarShowLabel: false,
        tabBarStyle: {
          height: 64,
          paddingTop: 9,
          paddingBottom: 8,
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          borderTopWidth: 1,
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
          tabBarAccessibilityLabel: '今日',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'today' : 'today-outline'} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="record"
        options={{
          title: '记录',
          tabBarAccessibilityLabel: '记录',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'add-circle' : 'add-circle-outline'}
              color={color}
              size={size + 7}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: '历史',
          tabBarAccessibilityLabel: '历史',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'calendar' : 'calendar-outline'} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '设置',
          tabBarAccessibilityLabel: '设置',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'settings' : 'settings-outline'} color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
