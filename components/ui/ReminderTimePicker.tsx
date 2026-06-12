import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/constants/Theme';
import { formatReminderTime } from '@/lib/reminderSettings';

interface Props {
  label: string;
  hour: number;
  minute: number;
  disabled?: boolean;
  onChange: (time: { hour: number; minute: number }) => void;
}

export function ReminderTimePicker({ label, hour, minute, disabled = false, onChange }: Props) {
  const value = createPickerDate(hour, minute);

  const setTimePart = (nextDate: Date) => {
    onChange({ hour: nextDate.getHours(), minute: nextDate.getMinutes() });
  };

  const openAndroidPicker = () => {
    DateTimePickerAndroid.open({
      mode: 'time',
      value,
      is24Hour: true,
      onChange: (_event: DateTimePickerEvent, selectedDate?: Date) => {
        if (selectedDate) {
          setTimePart(selectedDate);
        }
      },
    });
  };

  if (Platform.OS === 'android') {
    return (
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={openAndroidPicker}
        style={({ pressed }) => [
          styles.androidButton,
          disabled && styles.disabled,
          pressed && styles.pressed,
        ]}
      >
        <Ionicons name="time-outline" size={18} color={theme.colors.primary} />
        <View style={styles.buttonCopy}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.time}>{formatReminderTime({ hour, minute })}</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={[styles.iosRow, disabled && styles.disabled]}>
      <View style={styles.buttonCopy}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.time}>{formatReminderTime({ hour, minute })}</Text>
      </View>
      <DateTimePicker
        value={value}
        mode="time"
        display={Platform.OS === 'ios' ? 'compact' : 'default'}
        disabled={disabled}
        is24Hour
        onChange={(_event, selectedDate) => selectedDate && setTimePart(selectedDate)}
      />
    </View>
  );
}

function createPickerDate(hour: number, minute: number): Date {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date;
}

const styles = StyleSheet.create({
  androidButton: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    borderRadius: 13,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.surfaceInset,
    paddingHorizontal: 12,
  },
  iosRow: {
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
  buttonCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  label: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: '900',
  },
  time: {
    color: theme.colors.text,
    fontSize: 16,
    lineHeight: 19,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.72,
  },
});
