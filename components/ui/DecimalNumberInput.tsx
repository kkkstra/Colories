import { useEffect, useState } from 'react';
import { TextInput, type TextInputProps } from 'react-native';

const DECIMAL_INPUT_PATTERN = /^\d*(?:\.\d*)?$/;

type Props = Omit<TextInputProps, 'keyboardType' | 'onBlur' | 'onChangeText' | 'onFocus' | 'value'> & {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  onBlur?: TextInputProps['onBlur'];
  onFocus?: TextInputProps['onFocus'];
};

export function DecimalNumberInput({
  value,
  onValueChange,
  min = 0,
  max = 100000,
  onBlur,
  onFocus,
  ...props
}: Props) {
  const [draft, setDraft] = useState(() => formatDecimalValue(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setDraft(formatDecimalValue(value));
    }
  }, [focused, value]);

  const updateDraft = (nextValue: string) => {
    const normalized = normalizeDecimalText(nextValue);
    if (!DECIMAL_INPUT_PATTERN.test(normalized)) {
      return;
    }
    setDraft(normalized);
    const parsed = parseDecimalText(normalized);
    if (parsed !== null) {
      onValueChange(clampDecimal(parsed, min, max));
    }
  };

  return (
    <TextInput
      {...props}
      keyboardType="decimal-pad"
      inputMode="decimal"
      value={draft}
      onChangeText={updateDraft}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        const parsed = parseDecimalText(draft);
        if (parsed === null) {
          setDraft(formatDecimalValue(value));
        } else {
          const clamped = clampDecimal(parsed, min, max);
          onValueChange(clamped);
          setDraft(formatDecimalValue(clamped));
        }
        onBlur?.(event);
      }}
    />
  );
}

function normalizeDecimalText(value: string): string {
  return value.replace(/[，,]/g, '.').trim();
}

function parseDecimalText(value: string): number | null {
  if (!value || value === '.') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampDecimal(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatDecimalValue(value: number): string {
  return Number.isFinite(value) ? String(value) : '0';
}
