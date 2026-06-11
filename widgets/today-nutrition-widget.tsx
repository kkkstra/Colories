import { HStack, ProgressView, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  background,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  padding,
  progressViewStyle,
  shapes,
  tint,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import type { NutritionWidgetSnapshot } from '@/types/domain';

const FALLBACK: NutritionWidgetSnapshot = {
  dateKey: '',
  consumedCalories: 0,
  targetCalories: 0,
  remainingCalories: 0,
  calorieProgress: 0,
  protein: 0,
  proteinTarget: 0,
  proteinProgress: 0,
  carbs: 0,
  carbsTarget: 0,
  carbsProgress: 0,
  fat: 0,
  fatTarget: 0,
  fatProgress: 0,
  statusLabel: '等待同步',
  updatedAtLabel: '--:--',
  hasTargets: false,
};

function TodayNutritionWidget(
  props: Partial<NutritionWidgetSnapshot>,
  environment: WidgetEnvironment,
) {
  'widget';
  const snapshot = { ...FALLBACK, ...props };
  const isSmall = environment.widgetFamily === 'systemSmall';
  const remainingLabel =
    snapshot.remainingCalories < 0 ? '超出' : snapshot.hasTargets ? '剩余' : '今日摄入';
  const remainingValue = snapshot.hasTargets
    ? Math.abs(snapshot.remainingCalories)
    : snapshot.consumedCalories;
  const accent = snapshot.remainingCalories < 0 ? '#FF5A3D' : '#275DFF';

  if (isSmall) {
    return (
      <VStack
        alignment="leading"
        spacing={10}
        modifiers={[
          padding({ all: 14 }),
          containerBackground('#F2F5F7', 'widget'),
          widgetURL('calories://record'),
        ]}
      >
        <HStack spacing={6} modifiers={[frame({ maxWidth: 10000 })]}>
          <Text modifiers={[font({ size: 12, weight: 'bold' }), foregroundStyle('#667085')]}>
            燃卡
          </Text>
          <Spacer />
          <Text modifiers={[font({ size: 10, weight: 'semibold' }), foregroundStyle('#98A2B3')]}>
            {snapshot.updatedAtLabel}
          </Text>
        </HStack>
        <VStack alignment="leading" spacing={2}>
          <Text modifiers={[font({ size: 12, weight: 'bold' }), foregroundStyle('#667085')]}>
            {remainingLabel}
          </Text>
          <HStack spacing={4} alignment="lastTextBaseline">
            <Text modifiers={[font({ size: 34, weight: 'black', design: 'rounded' }), foregroundStyle(accent)]}>
              {remainingValue}
            </Text>
            <Text modifiers={[font({ size: 12, weight: 'bold' }), foregroundStyle('#667085')]}>
              kcal
            </Text>
          </HStack>
        </VStack>
        <ProgressView
          value={Math.min(snapshot.calorieProgress, 1)}
          modifiers={[progressViewStyle('linear'), tint(accent)]}
        />
        <Text modifiers={[font({ size: 11, weight: 'bold' }), foregroundStyle('#667085')]}>
          {snapshot.statusLabel}
        </Text>
      </VStack>
    );
  }

  return (
    <VStack
      alignment="leading"
      spacing={11}
      modifiers={[
        padding({ all: 16 }),
        containerBackground('#F2F5F7', 'widget'),
        widgetURL('calories://record'),
      ]}
    >
      <HStack spacing={10} modifiers={[frame({ maxWidth: 10000 })]}>
        <VStack alignment="leading" spacing={2}>
          <Text modifiers={[font({ size: 13, weight: 'black' }), foregroundStyle('#111827')]}>
            今日营养
          </Text>
          <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle('#667085')]}>
            {snapshot.statusLabel} · {snapshot.updatedAtLabel}
          </Text>
        </VStack>
        <Spacer />
        <VStack alignment="trailing" spacing={0}>
          <Text modifiers={[font({ size: 11, weight: 'bold' }), foregroundStyle('#667085')]}>
            {remainingLabel}
          </Text>
          <HStack spacing={4} alignment="lastTextBaseline">
            <Text modifiers={[font({ size: 28, weight: 'black', design: 'rounded' }), foregroundStyle(accent)]}>
              {remainingValue}
            </Text>
            <Text modifiers={[font({ size: 11, weight: 'bold' }), foregroundStyle('#667085')]}>
              kcal
            </Text>
          </HStack>
        </VStack>
      </HStack>
      <ProgressView
        value={Math.min(snapshot.calorieProgress, 1)}
        modifiers={[progressViewStyle('linear'), tint(accent)]}
      />
      <HStack spacing={8} modifiers={[frame({ maxWidth: 10000 })]}>
        <MacroPill label="蛋白" value={snapshot.protein} target={snapshot.proteinTarget} color="#7867D9" />
        <MacroPill label="碳水" value={snapshot.carbs} target={snapshot.carbsTarget} color="#D8A928" />
        <MacroPill label="脂肪" value={snapshot.fat} target={snapshot.fatTarget} color="#E5678A" />
      </HStack>
    </VStack>
  );
}

function MacroPill({
  label,
  value,
  target,
  color,
}: {
  label: string;
  value: number;
  target: number;
  color: string;
}) {
  'widget';
  return (
    <VStack
      alignment="leading"
      spacing={3}
      modifiers={[
        frame({ minWidth: 0, maxWidth: 10000 }),
        padding({ horizontal: 10, vertical: 8 }),
        background('#FFFFFF', shapes.roundedRectangle({ cornerRadius: 12, roundedCornerStyle: 'continuous' })),
      ]}
    >
      <Text modifiers={[font({ size: 10, weight: 'bold' }), foregroundStyle(color)]}>
        {label}
      </Text>
      <Text modifiers={[font({ size: 13, weight: 'black', design: 'rounded' }), foregroundStyle('#111827')]}>
        {value}/{target}
      </Text>
    </VStack>
  );
}

export default createWidget<Partial<NutritionWidgetSnapshot>>(
  'TodayNutritionWidget',
  TodayNutritionWidget,
);
