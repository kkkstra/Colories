import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPlatform = vi.hoisted(() => ({
  OS: 'ios',
}));

const mockNotifications = vi.hoisted(() => ({
  cancelScheduledNotificationAsync: vi.fn(),
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
  scheduleNotificationAsync: vi.fn(),
  setNotificationChannelAsync: vi.fn(),
  setNotificationHandler: vi.fn(),
}));

vi.mock('react-native', () => ({
  Platform: mockPlatform,
}));

vi.mock('expo-router', () => ({
  router: {
    navigate: vi.fn(),
    push: vi.fn(),
  },
  useRootNavigationState: vi.fn(() => ({ key: 'root' })),
}));

vi.mock('expo-notifications', () => ({
  AndroidImportance: {
    HIGH: 'high',
  },
  AndroidNotificationPriority: {
    HIGH: 'high',
  },
  IosAuthorizationStatus: {
    AUTHORIZED: 2,
    DENIED: 1,
    EPHEMERAL: 4,
    PROVISIONAL: 3,
  },
  PermissionStatus: {
    DENIED: 'denied',
    GRANTED: 'granted',
    UNDETERMINED: 'undetermined',
  },
  SchedulableTriggerInputTypes: {
    DAILY: 'daily',
    TIME_INTERVAL: 'timeInterval',
  },
  addNotificationResponseReceivedListener: vi.fn(() => ({ remove: vi.fn() })),
  clearLastNotificationResponse: vi.fn(),
  getLastNotificationResponse: vi.fn(() => null),
  ...mockNotifications,
}));

import {
  MEAL_REMINDER_CHANNEL_ID,
  MEAL_REMINDER_NOTIFICATION_IDS,
  TEST_MEAL_REMINDER_NOTIFICATION_ID,
  buildMealReminderNotificationRequests,
  scheduleMealReminderTestNotification,
  syncMealReminderNotifications,
} from '@/lib/reminders';
import { cloneReminderSettings, DEFAULT_REMINDER_SETTINGS } from '@/lib/reminderSettings';

describe('meal reminders', () => {
  beforeEach(() => {
    mockPlatform.OS = 'ios';
    mockNotifications.cancelScheduledNotificationAsync.mockResolvedValue(undefined);
    mockNotifications.getPermissionsAsync.mockResolvedValue({
      canAskAgain: true,
      granted: true,
      status: 'granted',
    });
    mockNotifications.requestPermissionsAsync.mockResolvedValue({
      canAskAgain: true,
      granted: true,
      status: 'granted',
    });
    mockNotifications.scheduleNotificationAsync.mockResolvedValue('scheduled-id');
    mockNotifications.setNotificationChannelAsync.mockResolvedValue(null);
    mockNotifications.setNotificationHandler.mockClear();
    mockNotifications.cancelScheduledNotificationAsync.mockClear();
    mockNotifications.getPermissionsAsync.mockClear();
    mockNotifications.requestPermissionsAsync.mockClear();
    mockNotifications.scheduleNotificationAsync.mockClear();
    mockNotifications.setNotificationChannelAsync.mockClear();
  });

  it('builds daily notification requests for enabled meal reminders', () => {
    const settings = cloneReminderSettings(DEFAULT_REMINDER_SETTINGS);
    settings.enabled = true;
    settings.meals.lunch.enabled = false;

    const requests = buildMealReminderNotificationRequests(settings);

    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({
      identifier: MEAL_REMINDER_NOTIFICATION_IDS.breakfast,
      trigger: {
        type: 'daily',
        hour: 8,
        minute: 0,
        channelId: MEAL_REMINDER_CHANNEL_ID,
      },
    });
    expect(requests.map((request) => request.identifier)).not.toContain(
      MEAL_REMINDER_NOTIFICATION_IDS.lunch,
    );
  });

  it('cancels known reminders and skips scheduling when reminders are off', async () => {
    const settings = cloneReminderSettings(DEFAULT_REMINDER_SETTINGS);

    await syncMealReminderNotifications(settings);

    expect(mockNotifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(3);
    expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(mockNotifications.getPermissionsAsync).not.toHaveBeenCalled();
  });

  it('schedules enabled reminders when notification permission is granted', async () => {
    const settings = cloneReminderSettings(DEFAULT_REMINDER_SETTINGS);
    settings.enabled = true;

    await syncMealReminderNotifications(settings);

    expect(mockNotifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(3);
    expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalledTimes(3);
    expect(mockNotifications.scheduleNotificationAsync.mock.calls[0][0].trigger.type).toBe(
      'daily',
    );
  });

  it('does not schedule reminders when permission is denied', async () => {
    const settings = cloneReminderSettings(DEFAULT_REMINDER_SETTINGS);
    settings.enabled = true;
    mockNotifications.getPermissionsAsync.mockResolvedValue({
      canAskAgain: false,
      granted: false,
      status: 'denied',
    });

    await syncMealReminderNotifications(settings);

    expect(mockNotifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(3);
    expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('schedules a one-minute test reminder after permission is granted', async () => {
    const permissionStatus = await scheduleMealReminderTestNotification();

    expect(permissionStatus).toBe('granted');
    expect(mockNotifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(
      TEST_MEAL_REMINDER_NOTIFICATION_ID,
    );
    expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: TEST_MEAL_REMINDER_NOTIFICATION_ID,
        trigger: expect.objectContaining({
          type: 'timeInterval',
          seconds: 60,
          channelId: MEAL_REMINDER_CHANNEL_ID,
        }),
      }),
    );
  });
});
