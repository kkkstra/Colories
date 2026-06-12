import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { ChoiceChips } from '@/components/ui/ChoiceChips';
import { FormField } from '@/components/ui/FormField';
import { Screen } from '@/components/ui/Screen';
import { theme } from '@/constants/Theme';
import { useApp } from '@/context/AppContext';
import { showAlert } from '@/lib/alert';
import { calculateTargets } from '@/lib/nutrition';
import type { ActivityLevel, BiologicalSex, FitnessGoal, UserProfile } from '@/types/domain';

type OnboardingStepId = 'age' | 'height' | 'weight' | 'sex' | 'activity' | 'goal' | 'review';

const STEPS: {
  id: OnboardingStepId;
  label: string;
  title: string;
  helper: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    id: 'age',
    label: '年龄',
    title: '先告诉我你的年龄',
    helper: '用于估算基础代谢，之后可以在设置里修改。',
    icon: 'calendar-clear-outline',
  },
  {
    id: 'height',
    label: '身高',
    title: '你的身高是多少',
    helper: '身高会参与每日热量和宏量营养目标计算。',
    icon: 'resize-outline',
  },
  {
    id: 'weight',
    label: '体重',
    title: '现在的体重是多少',
    helper: '蛋白质和脂肪目标会根据体重给出初始建议。',
    icon: 'barbell-outline',
  },
  {
    id: 'sex',
    label: '性别',
    title: '选择用于估算的生理性别',
    helper: '这里只用于营养目标估算，不会上传。',
    icon: 'body-outline',
  },
  {
    id: 'activity',
    label: '活动',
    title: '平时活动量接近哪一种',
    helper: '选最接近日常节奏的选项，不需要精确到每一天。',
    icon: 'walk-outline',
  },
  {
    id: 'goal',
    label: '目标',
    title: '这阶段想怎么调整',
    helper: '燃卡会先给一个目标，你随时可以在设置页改。',
    icon: 'flag-outline',
  },
  {
    id: 'review',
    label: '确认',
    title: '这是你的起始目标',
    helper: '目标为日常估算值，适合记录和调整，不用于医疗建议。',
    icon: 'sparkles-outline',
  },
];

const SEX_OPTIONS = [
  { label: '男性', value: 'male', icon: 'male' },
  { label: '女性', value: 'female', icon: 'female' },
] as const;

const ACTIVITY_OPTIONS = [
  { label: '久坐', value: 'sedentary', icon: 'desktop-outline' },
  { label: '轻度', value: 'light', icon: 'walk-outline' },
  { label: '常规', value: 'moderate', icon: 'barbell-outline' },
  { label: '高强度', value: 'active', icon: 'flame-outline' },
  { label: '运动员', value: 'very_active', icon: 'trophy-outline' },
] as const;

const GOAL_OPTIONS = [
  { label: '减脂', value: 'cut', icon: 'trending-down' },
  { label: '维持', value: 'maintain', icon: 'remove' },
  { label: '增肌', value: 'gain', icon: 'trending-up' },
] as const;

export default function OnboardingScreen() {
  const { loading, profile, persistProfile } = useApp();
  const [stepIndex, setStepIndex] = useState(0);
  const [age, setAge] = useState('28');
  const [height, setHeight] = useState('175');
  const [weight, setWeight] = useState('70');
  const [sex, setSex] = useState<BiologicalSex>('male');
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('moderate');
  const [goal, setGoal] = useState<FitnessGoal>('maintain');
  const [saving, setSaving] = useState(false);

  const draft = useMemo<UserProfile>(
    () => ({
      age: Number(age) || 0,
      heightCm: Number(height) || 0,
      weightKg: Number(weight) || 0,
      sex,
      activityLevel,
      goal,
    }),
    [activityLevel, age, goal, height, sex, weight],
  );
  const targets = calculateTargets(draft);
  const step = STEPS[stepIndex];
  const isLastStep = stepIndex === STEPS.length - 1;

  if (!loading && profile) {
    return <Redirect href="/" />;
  }

  const handleNext = () => {
    const validationMessage = validateStep(step.id, draft);
    if (validationMessage) {
      showAlert('请检查信息', validationMessage);
      return;
    }
    if (isLastStep) {
      void handleSave();
      return;
    }
    setStepIndex((current) => Math.min(current + 1, STEPS.length - 1));
  };

  const handleBack = () => {
    setStepIndex((current) => Math.max(current - 1, 0));
  };

  const handleSave = async () => {
    const validationMessage = validateProfile(draft);
    if (validationMessage) {
      showAlert('请检查信息', validationMessage);
      return;
    }
    setSaving(true);
    try {
      await persistProfile(draft, targets);
      router.replace('/');
    } catch (error) {
      showAlert('保存失败', error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen contentContainerStyle={styles.screenContent}>
      <View style={styles.header}>
        <View style={styles.brandMark}>
          <Ionicons name="flash" size={22} color="#FFFFFF" />
        </View>
        <View style={styles.brandCopy}>
          <Text style={styles.brandName}>燃卡</Text>
          <Text style={styles.brandMeta}>设置你的第一组目标</Text>
        </View>
        <View style={styles.stepBadge}>
          <Text style={styles.stepBadgeText}>
            {stepIndex + 1}/{STEPS.length}
          </Text>
        </View>
      </View>

      <View style={styles.progressTrack}>
        {STEPS.map((item, index) => (
          <View
            key={item.id}
            style={[
              styles.progressSegment,
              index <= stepIndex && styles.progressSegmentActive,
            ]}
          />
        ))}
      </View>

      <View style={styles.stepPanel}>
        <View style={styles.stepTopRow}>
          <View style={styles.stepIcon}>
            <Ionicons name={step.icon} size={23} color={theme.colors.primary} />
          </View>
          <Text style={styles.stepLabel}>{step.label}</Text>
        </View>
        <Text style={styles.title}>{step.title}</Text>
        <Text style={styles.helper}>{step.helper}</Text>

        <View style={styles.stepBody}>{renderStepContent(step.id, {
          age,
          setAge,
          height,
          setHeight,
          weight,
          setWeight,
          sex,
          setSex,
          activityLevel,
          setActivityLevel,
          goal,
          setGoal,
          targets,
        })}</View>
      </View>

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          disabled={stepIndex === 0 || saving}
          onPress={handleBack}
          style={({ pressed }) => [
            styles.backButton,
            stepIndex === 0 && styles.backButtonDisabled,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="chevron-back" size={18} color={theme.colors.primary} />
          <Text style={styles.backButtonText}>上一步</Text>
        </Pressable>
        <View style={styles.nextButton}>
          <AppButton
            label={isLastStep ? '开始记录' : '下一步'}
            icon={isLastStep ? 'checkmark' : 'arrow-forward'}
            onPress={handleNext}
            loading={saving}
          />
        </View>
      </View>
    </Screen>
  );
}

function renderStepContent(
  step: OnboardingStepId,
  props: {
    age: string;
    setAge: (value: string) => void;
    height: string;
    setHeight: (value: string) => void;
    weight: string;
    setWeight: (value: string) => void;
    sex: BiologicalSex;
    setSex: (value: BiologicalSex) => void;
    activityLevel: ActivityLevel;
    setActivityLevel: (value: ActivityLevel) => void;
    goal: FitnessGoal;
    setGoal: (value: FitnessGoal) => void;
    targets: ReturnType<typeof calculateTargets>;
  },
) {
  if (step === 'age') {
    return (
      <FormField
        label="年龄"
        value={props.age}
        onChangeText={props.setAge}
        keyboardType="number-pad"
        selectTextOnFocus
        style={styles.focusInput}
      />
    );
  }
  if (step === 'height') {
    return (
      <FormField
        label="身高 cm"
        value={props.height}
        onChangeText={props.setHeight}
        keyboardType="decimal-pad"
        selectTextOnFocus
        style={styles.focusInput}
      />
    );
  }
  if (step === 'weight') {
    return (
      <FormField
        label="体重 kg"
        value={props.weight}
        onChangeText={props.setWeight}
        keyboardType="decimal-pad"
        selectTextOnFocus
        style={styles.focusInput}
      />
    );
  }
  if (step === 'sex') {
    return (
      <ChoiceChips
        value={props.sex}
        onChange={props.setSex}
        options={SEX_OPTIONS}
        adaptive
        columns={2}
      />
    );
  }
  if (step === 'activity') {
    return (
      <ChoiceChips
        value={props.activityLevel}
        onChange={props.setActivityLevel}
        options={ACTIVITY_OPTIONS}
        adaptive
        minColumnWidth={104}
      />
    );
  }
  if (step === 'goal') {
    return (
      <ChoiceChips
        value={props.goal}
        onChange={props.setGoal}
        options={GOAL_OPTIONS}
        adaptive
        columns={3}
      />
    );
  }
  return (
    <View style={styles.targetGrid}>
      <Target label="热" value={props.targets.calories} color={theme.colors.primary} />
      <Target label="蛋" value={props.targets.protein} color={theme.colors.protein} />
      <Target label="碳" value={props.targets.carbs} color={theme.colors.carbs} />
      <Target label="脂" value={props.targets.fat} color={theme.colors.fat} />
    </View>
  );
}

function Target({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.target}>
      <View style={[styles.targetDot, { backgroundColor: color }]} />
      <Text style={styles.targetLabel}>{label}</Text>
      <Text style={styles.targetValue}>{Math.round(value)}</Text>
    </View>
  );
}

function validateStep(step: OnboardingStepId, profile: UserProfile): string | null {
  if (step === 'age' && (profile.age < 14 || profile.age > 100)) {
    return '年龄需要在 14 到 100 岁之间。';
  }
  if (step === 'height' && (profile.heightCm < 120 || profile.heightCm > 230)) {
    return '身高需要在 120 到 230 cm 之间。';
  }
  if (step === 'weight' && (profile.weightKg < 30 || profile.weightKg > 300)) {
    return '体重需要在 30 到 300 kg 之间。';
  }
  return null;
}

function validateProfile(profile: UserProfile): string | null {
  return (
    validateStep('age', profile) ??
    validateStep('height', profile) ??
    validateStep('weight', profile)
  );
}

const styles = StyleSheet.create({
  screenContent: {
    gap: 14,
  },
  header: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: theme.radius.large,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.ink,
    boxShadow: theme.shadows.large,
  },
  brandMark: {
    width: 44,
    height: 44,
    borderRadius: 15,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandCopy: {
    flex: 1,
    minWidth: 0,
  },
  brandName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0,
  },
  brandMeta: {
    color: '#B9C4D7',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  stepBadge: {
    minWidth: 54,
    height: 36,
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  stepBadgeText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    flexDirection: 'row',
    gap: 6,
  },
  progressSegment: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.borderSoft,
  },
  progressSegmentActive: {
    backgroundColor: theme.colors.primary,
  },
  stepPanel: {
    minHeight: 390,
    gap: 12,
    padding: 18,
    borderRadius: theme.radius.large,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.surfaceRaised,
    borderWidth: 1,
    borderColor: '#FFFFFF',
    boxShadow: theme.shadows.medium,
  },
  stepTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.surfaceTint,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLabel: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: '900',
  },
  title: {
    color: theme.colors.text,
    fontSize: 29,
    lineHeight: 35,
    fontWeight: '900',
    letterSpacing: 0,
  },
  helper: {
    color: theme.colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '700',
  },
  stepBody: {
    flex: 1,
    justifyContent: 'center',
    gap: 14,
    paddingVertical: 16,
  },
  focusInput: {
    height: 62,
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
  },
  targetGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  target: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 5,
    paddingVertical: 13,
    borderRadius: 13,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: theme.colors.surfaceInset,
  },
  targetDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  targetLabel: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
  },
  targetValue: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backButton: {
    minHeight: 52,
    minWidth: 116,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    boxShadow: theme.shadows.small,
  },
  backButtonDisabled: {
    opacity: 0.38,
  },
  backButtonText: {
    color: theme.colors.primary,
    fontSize: 14,
    fontWeight: '900',
  },
  nextButton: {
    flex: 1,
  },
  pressed: {
    opacity: 0.78,
    transform: [{ translateY: 1 }],
  },
});
