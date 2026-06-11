import Ionicons from '@expo/vector-icons/Ionicons';
import { BlurTargetView, BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '@/constants/Theme';

const TAB_BAR_HEIGHT = 78;
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
  const blurTargetRef = useRef<View | null>(null);

  return (
    <BlurTargetView ref={blurTargetRef} collapsable={false} style={styles.tabsTarget}>
      <Tabs
        tabBar={(props) => <FloatingTabBar {...props} blurTargetRef={blurTargetRef} />}
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
    </BlurTargetView>
  );
}

function FloatingTabBar({ state, descriptors, navigation, blurTargetRef }: any) {
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
        <View key={route.key} style={[styles.tabSlot, styles.centerTabSlot]}>
          <CenterTabButton
            focused={focused}
            label={label}
            onLongPress={onLongPress}
            onPress={onPress}
          />
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
        <View style={styles.tabShellClip}>
          <BlurView
            blurTarget={blurTargetRef}
            intensity={100}
            tint="systemMaterialLight"
            blurMethod="dimezisBlurView"
            blurReductionFactor={1}
            style={styles.tabShell}
          >
            {TAB_ORDER.map((routeName) => renderTab(routeName))}
          </BlurView>
        </View>
      </View>
    </View>
  );
}

function CenterTabButton({
  focused,
  label,
  onLongPress,
  onPress,
}: {
  focused: boolean;
  label: string;
  onLongPress: () => void;
  onPress: () => void;
}) {
  const pressProgress = useSharedValue(0);

  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: pressProgress.value * 1.5 },
      { scale: 1 - pressProgress.value * 0.045 },
    ],
  }));

  const plusAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressProgress.value * 0.05 }],
  }));

  const handlePressIn = () => {
    pressProgress.value = withTiming(1, { duration: 90 });
  };

  const handlePressOut = () => {
    pressProgress.value = withSpring(0, {
      damping: 15,
      mass: 0.5,
      stiffness: 340,
    });
  };

  return (
    <Animated.View
      style={[styles.centerButton, focused && styles.centerButtonFocused, buttonAnimatedStyle]}
    >
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={{ selected: focused }}
        onLongPress={onLongPress}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.centerButtonTouch}
      >
        <Animated.View pointerEvents="none" style={[styles.centerPlus, plusAnimatedStyle]}>
          <View style={[styles.centerPlusBar, styles.centerPlusHorizontal]} />
          <View style={[styles.centerPlusBar, styles.centerPlusVertical]} />
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tabsTarget: {
    flex: 1,
  },
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
    paddingHorizontal: 14,
    pointerEvents: 'box-none',
  },
  tabShellClip: {
    width: '100%',
    maxWidth: 430,
    height: TAB_BAR_HEIGHT,
    borderRadius: 44,
    borderCurve: 'continuous',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.72)',
    backgroundColor: 'rgba(255, 255, 255, 0.36)',
    boxShadow: '0 20px 44px rgba(16, 24, 40, 0.18)',
  },
  tabShell: {
    flex: 1,
    borderRadius: 44,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
  },
  tabSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerTabSlot: {
    flex: 1.1,
  },
  tabButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonFocused: {
    backgroundColor: theme.colors.primaryWash,
    borderWidth: 1,
    borderColor: '#D9E2FF',
  },
  centerButton: {
    width: 62,
    height: 42,
    borderRadius: 21,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: theme.colors.primary,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.58)',
    boxShadow: '0 12px 22px rgba(39, 93, 255, 0.3)',
  },
  centerButtonTouch: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerPlus: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerPlusBar: {
    position: 'absolute',
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
  centerPlusHorizontal: {
    width: 20,
    height: 3,
  },
  centerPlusVertical: {
    width: 3,
    height: 20,
  },
  centerButtonFocused: {
    borderColor: 'rgba(255, 255, 255, 0.78)',
    boxShadow: '0 12px 24px rgba(39, 93, 255, 0.36)',
  },
  pressed: {
    opacity: 0.72,
  },
});
