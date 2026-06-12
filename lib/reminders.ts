import * as Notifications from 'expo-notifications';
import { router, useRootNavigationState } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import {
  activeReminderCount,
  REMINDER_MEAL_LABELS,
  REMINDER_MEAL_TYPES,
} from '@/lib/reminderSettings';
import type { MainMealType, ReminderSettings } from '@/types/domain';

export type ReminderPermissionStatus = 'unsupported' | 'granted' | 'denied' | 'undetermined';

export const MEAL_REMINDER_CHANNEL_ID = 'meal-reminders';
export const MEAL_REMINDER_URL = '/record';
export const MEAL_REMINDER_ROUTE = '/(tabs)/record';
export const TEST_MEAL_REMINDER_NOTIFICATION_ID = 'meal-reminder-test';

export const MEAL_REMINDER_NOTIFICATION_IDS: Record<MainMealType, string> = {
  breakfast: 'meal-reminder-breakfast',
  lunch: 'meal-reminder-lunch',
  dinner: 'meal-reminder-dinner',
};

export function configureMealReminderNotificationHandler(): void {
  if (Platform.OS === 'web') {
    return;
  }
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export function useMealReminderNotificationObserver(): void {
  const rootNavigationState = useRootNavigationState();
  const pendingNotificationRef = useRef<Notifications.Notification | null>(null);
  const navigationReady = Boolean(rootNavigationState?.key);

  const redirect = useCallback(
    (notification: Notifications.Notification) => {
      const url = notification.request.content.data?.url;
      if (typeof url !== 'string') {
        return;
      }
      if (!navigationReady) {
        pendingNotificationRef.current = notification;
        return;
      }
      pendingNotificationRef.current = null;
      router.navigate(MEAL_REMINDER_ROUTE as never);
      Notifications.clearLastNotificationResponse();
    },
    [navigationReady],
  );

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    const response = Notifications.getLastNotificationResponse();
    if (response?.notification) {
      redirect(response.notification);
    }

    const subscription = Notifications.addNotificationResponseReceivedListener((nextResponse) => {
      redirect(nextResponse.notification);
    });

    return () => {
      subscription.remove();
    };
  }, [redirect]);

  useEffect(() => {
    if (Platform.OS === 'web' || !navigationReady || !pendingNotificationRef.current) {
      return;
    }
    redirect(pendingNotificationRef.current);
  }, [navigationReady, redirect]);
}

export async function getReminderPermissionStatusAsync(): Promise<ReminderPermissionStatus> {
  if (Platform.OS === 'web') {
    return 'unsupported';
  }
  const permissions = await Notifications.getPermissionsAsync();
  return mapPermissionStatus(permissions);
}

export async function requestReminderPermissionsAsync(): Promise<ReminderPermissionStatus> {
  if (Platform.OS === 'web') {
    return 'unsupported';
  }
  await ensureMealReminderChannelAsync();
  const currentPermissions = await Notifications.getPermissionsAsync();
  if (isPermissionAllowed(currentPermissions) || !currentPermissions.canAskAgain) {
    return mapPermissionStatus(currentPermissions);
  }
  const nextPermissions = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: false,
      allowSound: true,
    },
  });
  return mapPermissionStatus(nextPermissions);
}

export async function syncMealReminderNotifications(
  settings: ReminderSettings,
): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }

  await cancelMealReminderNotificationsAsync();
  if (activeReminderCount(settings) === 0) {
    return;
  }

  await ensureMealReminderChannelAsync();
  const permissions = await Notifications.getPermissionsAsync();
  if (!isPermissionAllowed(permissions)) {
    return;
  }

  for (const request of buildMealReminderNotificationRequests(settings)) {
    await Notifications.scheduleNotificationAsync(request);
  }
}

export async function scheduleMealReminderTestNotification(): Promise<ReminderPermissionStatus> {
  if (Platform.OS === 'web') {
    return 'unsupported';
  }

  const permissionStatus = await requestReminderPermissionsAsync();
  if (permissionStatus !== 'granted') {
    return permissionStatus;
  }

  await Notifications.cancelScheduledNotificationAsync(TEST_MEAL_REMINDER_NOTIFICATION_ID);
  await Notifications.scheduleNotificationAsync({
    identifier: TEST_MEAL_REMINDER_NOTIFICATION_ID,
    content: {
      title: '燃卡测试提醒',
      body: '这是一条 1 分钟后的测试通知。',
      sound: 'default',
      priority: Notifications.AndroidNotificationPriority.HIGH,
      data: {
        kind: 'meal-reminder-test',
        url: MEAL_REMINDER_URL,
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 60,
      channelId: MEAL_REMINDER_CHANNEL_ID,
    },
  });

  return permissionStatus;
}

export async function cancelMealReminderNotificationsAsync(): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }
  await Promise.all(
    REMINDER_MEAL_TYPES.map((mealType) =>
      Notifications.cancelScheduledNotificationAsync(MEAL_REMINDER_NOTIFICATION_IDS[mealType]),
    ),
  );
}

export function buildMealReminderNotificationRequests(
  settings: ReminderSettings,
): Notifications.NotificationRequestInput[] {
  if (activeReminderCount(settings) === 0) {
    return [];
  }

  return REMINDER_MEAL_TYPES.flatMap((mealType) => {
    const mealSetting = settings.meals[mealType];
    if (!mealSetting.enabled) {
      return [];
    }
    const label = REMINDER_MEAL_LABELS[mealType];
    return [
      {
        identifier: MEAL_REMINDER_NOTIFICATION_IDS[mealType],
        content: {
          title: `${label}记录时间到了`,
          body: '打开燃卡记录这一餐。',
          sound: 'default',
          priority: Notifications.AndroidNotificationPriority.HIGH,
          data: {
            kind: 'meal-reminder',
            mealType,
            url: MEAL_REMINDER_URL,
          },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: mealSetting.hour,
          minute: mealSetting.minute,
          channelId: MEAL_REMINDER_CHANNEL_ID,
        },
      },
    ];
  });
}

async function ensureMealReminderChannelAsync(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  await Notifications.setNotificationChannelAsync(MEAL_REMINDER_CHANNEL_ID, {
    name: '饮食记录提醒',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#275DFF',
  });
}

function mapPermissionStatus(
  permissions: Notifications.NotificationPermissionsStatus,
): ReminderPermissionStatus {
  if (isPermissionAllowed(permissions)) {
    return 'granted';
  }
  if (
    permissions.status === Notifications.PermissionStatus.DENIED ||
    permissions.ios?.status === Notifications.IosAuthorizationStatus.DENIED
  ) {
    return 'denied';
  }
  return 'undetermined';
}

function isPermissionAllowed(
  permissions: Notifications.NotificationPermissionsStatus,
): boolean {
  return (
    permissions.granted ||
    permissions.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED ||
    permissions.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    permissions.ios?.status === Notifications.IosAuthorizationStatus.EPHEMERAL
  );
}
