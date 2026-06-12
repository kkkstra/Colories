import type { MainMealType, MealReminderSetting, ReminderSettings } from '@/types/domain';

export const REMINDER_MEAL_TYPES: MainMealType[] = ['breakfast', 'lunch', 'dinner'];

export const REMINDER_MEAL_LABELS: Record<MainMealType, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
};

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled: false,
  meals: {
    breakfast: { enabled: true, hour: 8, minute: 0 },
    lunch: { enabled: true, hour: 12, minute: 30 },
    dinner: { enabled: true, hour: 18, minute: 30 },
  },
};

export function cloneReminderSettings(settings: ReminderSettings): ReminderSettings {
  return {
    enabled: settings.enabled,
    meals: {
      breakfast: { ...settings.meals.breakfast },
      lunch: { ...settings.meals.lunch },
      dinner: { ...settings.meals.dinner },
    },
  };
}

export function activeReminderCount(settings: ReminderSettings): number {
  if (!settings.enabled) {
    return 0;
  }
  return REMINDER_MEAL_TYPES.filter((mealType) => settings.meals[mealType].enabled).length;
}

export function formatReminderTime(time: Pick<MealReminderSetting, 'hour' | 'minute'>): string {
  return `${pad2(time.hour)}:${pad2(time.minute)}`;
}

export function validateReminderSettings(settings: ReminderSettings): ReminderSettings {
  for (const mealType of REMINDER_MEAL_TYPES) {
    const time = settings.meals[mealType];
    if (!isValidReminderTime(time.hour, time.minute)) {
      throw new Error(`${REMINDER_MEAL_LABELS[mealType]}提醒时间无效。`);
    }
  }
  return cloneReminderSettings(settings);
}

export function reminderSettingsFromPartial(
  settings: Partial<ReminderSettings> | null | undefined,
): ReminderSettings {
  if (!settings) {
    return cloneReminderSettings(DEFAULT_REMINDER_SETTINGS);
  }
  return {
    enabled: Boolean(settings.enabled),
    meals: {
      breakfast: normalizeMealReminder(settings.meals?.breakfast, 'breakfast'),
      lunch: normalizeMealReminder(settings.meals?.lunch, 'lunch'),
      dinner: normalizeMealReminder(settings.meals?.dinner, 'dinner'),
    },
  };
}

function normalizeMealReminder(
  setting: Partial<MealReminderSetting> | undefined,
  mealType: MainMealType,
): MealReminderSetting {
  const fallback = DEFAULT_REMINDER_SETTINGS.meals[mealType];
  const hour = Number(setting?.hour);
  const minute = Number(setting?.minute);
  return {
    enabled: setting?.enabled ?? fallback.enabled,
    hour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : fallback.hour,
    minute: Number.isInteger(minute) && minute >= 0 && minute <= 59 ? minute : fallback.minute,
  };
}

function isValidReminderTime(hour: number, minute: number): boolean {
  return (
    Number.isInteger(hour) &&
    Number.isInteger(minute) &&
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59
  );
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}
