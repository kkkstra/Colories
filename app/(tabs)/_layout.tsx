import Ionicons from '@expo/vector-icons/Ionicons';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '@/constants/Theme';

const TAB_BAR_HEIGHT = 74;
const TAB_BOTTOM_GAP = 14;
const TAB_ORDER = ['index', 'history', 'record', 'insights', 'settings'] as const;

const TAB_CONFIG = {
  index: {
    label: '今日',
    icon: {
      default: 'home-outline',
      selected: 'home',
    },
  },
  history: {
    label: '历史',
    icon: {
      default: 'calendar-outline',
      selected: 'calendar',
    },
  },
  record: {
    label: '记录',
    icon: {
      default: 'add',
      selected: 'add',
    },
  },
  insights: {
    label: '洞察',
    icon: {
      default: 'analytics-outline',
      selected: 'analytics',
    },
  },
  settings: {
    label: '设置',
    icon: {
      default: 'settings-outline',
      selected: 'settings',
    },
  },
} satisfies Record<
  string,
  {
    label: string;
    icon: {
      default: keyof typeof Ionicons.glyphMap;
      selected: keyof typeof Ionicons.glyphMap;
    };
  }
>;

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
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
        name="record"
        options={{
          title: '记录',
          tabBarAccessibilityLabel: '记录',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="add" color={color} size={size + 7} />
          ),
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: '洞察',
          tabBarAccessibilityLabel: '洞察',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'analytics' : 'analytics-outline'}
              color={color}
              size={size}
            />
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

function FloatingTabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets();
  const bottomGap = Math.max(insets.bottom, TAB_BOTTOM_GAP);
  const routeByName = Object.fromEntries(state.routes.map((route: any) => [route.name, route]));

  const renderTab = (routeName: (typeof TAB_ORDER)[number]) => {
    const route = routeByName[routeName];
    if (!route) {
      return null;
    }

    const routeIndex = state.routes.findIndex((item: any) => item.key === route.key);
    const options = descriptors[route.key]?.options ?? {};
    const focused = state.index === routeIndex;
    const config = TAB_CONFIG[routeName];
    const center = routeName === 'record';
    const color = focused ? theme.colors.primary : theme.colors.textMuted;
    const label = options.tabBarAccessibilityLabel ?? options.title ?? config.label;

    const onPress = () => {
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });

      if (!focused && !event.defaultPrevented) {
        navigation.navigate(route.name, route.params);
      }
    };

    const onLongPress = () => {
      navigation.emit({
        type: 'tabLongPress',
        target: route.key,
      });
    };

    if (center) {
      return (
        <View key={route.key} style={styles.tabSlot}>
          <Pressable
            accessibilityLabel={label}
            accessibilityRole="button"
            accessibilityState={{ selected: focused }}
            onLongPress={onLongPress}
            onPress={onPress}
            style={({ pressed }) => [
              styles.centerButton,
              focused && styles.centerButtonFocused,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="add" size={38} color="#FFFFFF" />
          </Pressable>
        </View>
      );
    }

    return (
      <View key={route.key} style={styles.tabSlot}>
        <Pressable
          accessibilityLabel={label}
          accessibilityRole="button"
          accessibilityState={{ selected: focused }}
          onLongPress={onLongPress}
          onPress={onPress}
          style={({ pressed }) => [
            styles.tabButton,
            focused && styles.tabButtonFocused,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons
            name={focused ? config.icon.selected : config.icon.default}
            size={26}
            color={color}
          />
        </Pressable>
      </View>
    );
  };

  return (
    <View style={styles.tabHost}>
      <View style={[styles.tabDock, { bottom: bottomGap }]}>
        <BlurView
          intensity={82}
          tint="systemMaterialLight"
          blurMethod="dimezisBlurViewSdk31Plus"
          style={styles.tabShell}
        >
          {TAB_ORDER.map((routeName) => renderTab(routeName))}
        </BlurView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabHost: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 132,
    backgroundColor: 'transparent',
    pointerEvents: 'box-none',
    zIndex: 20,
  },
  tabDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 18,
    pointerEvents: 'box-none',
  },
  tabShell: {
    width: '100%',
    maxWidth: 430,
    height: TAB_BAR_HEIGHT,
    borderRadius: 37,
    borderCurve: 'continuous',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.72)',
    backgroundColor: 'rgba(255, 255, 255, 0.38)',
    boxShadow: '0 18px 42px rgba(39, 93, 255, 0.18)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  tabSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonFocused: {
    backgroundColor: theme.colors.primarySoft,
  },
  centerButton: {
    width: 66,
    height: 58,
    borderRadius: 29,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
    boxShadow: '0 13px 24px rgba(39, 93, 255, 0.34)',
  },
  centerButtonFocused: {
    backgroundColor: theme.colors.primaryDark,
  },
  pressed: {
    opacity: 0.72,
  },
});
