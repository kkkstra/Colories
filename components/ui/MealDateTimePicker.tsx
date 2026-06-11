import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/constants/Theme';

interface Props {
  value: Date;
  onChange: (date: Date) => void;
}

export function MealDateTimePicker({ value, onChange }: Props) {
  const setDatePart = (nextDate: Date) => {
    const merged = new Date(value);
    merged.setFullYear(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate());
    onChange(merged);
  };

  const setTimePart = (nextDate: Date) => {
    const merged = new Date(value);
    merged.setHours(nextDate.getHours(), nextDate.getMinutes(), 0, 0);
    onChange(merged);
  };

  const openAndroidPicker = (mode: 'date' | 'time') => {
    DateTimePickerAndroid.open({
      mode,
      value,
      is24Hour: true,
      onChange: (_event: DateTimePickerEvent, selectedDate?: Date) => {
        if (!selectedDate) {
          return;
        }
        if (mode === 'date') {
          setDatePart(selectedDate);
        } else {
          setTimePart(selectedDate);
        }
      },
    });
  };

  if (Platform.OS === 'android') {
    return (
      <View style={styles.wrapper}>
        <DateTimeButton
          icon="calendar-outline"
          label="日期"
          value={formatDate(value)}
          onPress={() => openAndroidPicker('date')}
          variant="date"
        />
        <DateTimeButton
          icon="time-outline"
          label="时间"
          value={formatTime(value)}
          onPress={() => openAndroidPicker('time')}
          variant="time"
        />
      </View>
    );
  }

  return (
    <View style={styles.iosWrapper}>
      <View style={styles.iosPickerRow}>
        <Text style={styles.iosLabel}>日期</Text>
        <DateTimePicker
          value={value}
          mode="date"
          display={Platform.OS === 'ios' ? 'compact' : 'default'}
          onChange={(_event, selectedDate) => selectedDate && setDatePart(selectedDate)}
        />
      </View>
      <View style={styles.iosPickerRow}>
        <Text style={styles.iosLabel}>时间</Text>
        <DateTimePicker
          value={value}
          mode="time"
          display={Platform.OS === 'ios' ? 'compact' : 'default'}
          is24Hour
          onChange={(_event, selectedDate) => selectedDate && setTimePart(selectedDate)}
        />
      </View>
    </View>
  );
}

function DateTimeButton({
  icon,
  label,
  value,
  onPress,
  variant,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  onPress: () => void;
  variant: 'date' | 'time';
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'date' ? styles.dateButton : styles.timeButton,
        pressed && styles.pressed,
      ]}
    >
      <Ionicons name={icon} size={18} color={theme.colors.primary} />
      <View style={styles.buttonCopy}>
        <Text style={styles.buttonLabel}>{label}</Text>
        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.82}
          numberOfLines={1}
          style={styles.buttonValue}
        >
          {value}
        </Text>
      </View>
    </Pressable>
  );
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function formatTime(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    borderRadius: 13,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.surfaceInset,
    paddingHorizontal: 12,
  },
  dateButton: {
    flex: 1.24,
  },
  timeButton: {
    flex: 0.9,
  },
  buttonCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  buttonLabel: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: '900',
  },
  buttonValue: {
    color: theme.colors.text,
    fontSize: 16,
    lineHeight: 19,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  pressed: {
    opacity: 0.72,
  },
  iosWrapper: {
    gap: 10,
  },
  iosPickerRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    borderRadius: 13,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.surfaceInset,
    paddingHorizontal: 13,
  },
  iosLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '900',
  },
});
