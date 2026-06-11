import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { Card } from '@/components/ui/Card';
import { ChoiceChips } from '@/components/ui/ChoiceChips';
import { FormField } from '@/components/ui/FormField';
import { Screen } from '@/components/ui/Screen';
import { theme } from '@/constants/Theme';
import { useApp } from '@/context/AppContext';
import { showAlert } from '@/lib/alert';
import { calculateTargets } from '@/lib/nutrition';
import type { ActivityLevel, BiologicalSex, FitnessGoal, UserProfile } from '@/types/domain';

export default function OnboardingScreen() {
  const { loading, profile, persistProfile } = useApp();
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

  if (!loading && profile) {
    return <Redirect href="/" />;
  }

  const handleSave = async () => {
    if (
      draft.age < 14 ||
      draft.age > 100 ||
      draft.heightCm < 120 ||
      draft.heightCm > 230 ||
      draft.weightKg < 30 ||
      draft.weightKg > 300
    ) {
      showAlert('请检查身体信息', '年龄、身高或体重超出合理范围。');
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
    <Screen>
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Ionicons name="flash" size={28} color="#FFFFFF" />
        </View>
        <View style={styles.heroBars}>
          {[18, 30, 42, 55, 68].map((height, index) => (
            <View key={height} style={[styles.heroBar, { height, opacity: 0.35 + index * 0.14 }]} />
          ))}
        </View>
        <Text style={styles.title}>先设定目标</Text>
        <Text style={styles.subtitle}>身体数据只保存在本机</Text>
      </View>

      <Card variant="base" style={styles.sectionCard}>
        <SectionTitle icon="body-outline" title="身体" />
        <View style={styles.row}>
          <View style={styles.flex}>
            <FormField
              label="年龄"
              value={age}
              onChangeText={setAge}
              keyboardType="number-pad"
            />
          </View>
          <View style={styles.flex}>
            <FormField
              label="身高 cm"
              value={height}
              onChangeText={setHeight}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={styles.flex}>
            <FormField
              label="体重 kg"
              value={weight}
              onChangeText={setWeight}
              keyboardType="decimal-pad"
            />
          </View>
        </View>
        <ChoiceChips
          value={sex}
          onChange={setSex}
          options={[
            { label: '男性', value: 'male', icon: 'male' },
            { label: '女性', value: 'female', icon: 'female' },
          ]}
        />
      </Card>

      <Card variant="base" style={styles.sectionCard}>
        <SectionTitle icon="walk-outline" title="活动" />
        <ChoiceChips
          value={activityLevel}
          onChange={setActivityLevel}
          options={[
            { label: '久坐', value: 'sedentary', icon: 'desktop-outline' },
            { label: '轻度', value: 'light', icon: 'walk-outline' },
            { label: '常规', value: 'moderate', icon: 'barbell-outline' },
            { label: '高强度', value: 'active', icon: 'flame-outline' },
            { label: '运动员', value: 'very_active', icon: 'trophy-outline' },
          ]}
        />
      </Card>

      <Card variant="base" style={styles.sectionCard}>
        <SectionTitle icon="flag-outline" title="目标" />
        <ChoiceChips
          value={goal}
          onChange={setGoal}
          options={[
            { label: '减脂', value: 'cut', icon: 'trending-down' },
            { label: '维持', value: 'maintain', icon: 'remove' },
            { label: '增肌', value: 'gain', icon: 'trending-up' },
          ]}
        />
        <View style={styles.targetGrid}>
          <Target label="热" value={targets.calories} color={theme.colors.primary} />
          <Target label="蛋" value={targets.protein} color={theme.colors.protein} />
          <Target label="碳" value={targets.carbs} color={theme.colors.carbs} />
          <Target label="脂" value={targets.fat} color={theme.colors.fat} />
        </View>
        <Text style={styles.disclaimer}>目标为日常估算值，可稍后调整。</Text>
      </Card>

      <AppButton label="开始记录" icon="arrow-forward" onPress={handleSave} loading={saving} />
    </Screen>
  );
}

function SectionTitle({
  icon,
  title,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
}) {
  return (
    <View style={styles.sectionHeading}>
      <View style={styles.sectionIcon}>
        <Ionicons name={icon} size={20} color={theme.colors.primary} />
      </View>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function Target({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.target}>
      <View style={[styles.targetDot, { backgroundColor: color }]} />
      <Text style={styles.targetLabel}>{label}</Text>
      <Text style={styles.targetValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    minHeight: 226,
    padding: 22,
    borderRadius: theme.radius.large,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.ink,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    gap: 6,
    boxShadow: theme.shadows.large,
  },
  heroIcon: {
    position: 'absolute',
    top: 20,
    left: 22,
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBars: {
    position: 'absolute',
    right: 20,
    top: 26,
    height: 78,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 7,
  },
  heroBar: {
    width: 12,
    borderRadius: 6,
    backgroundColor: theme.colors.accent,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '900',
    letterSpacing: -1,
  },
  subtitle: {
    color: '#AEB9CD',
    fontSize: 13,
  },
  sectionCard: {
    gap: 15,
    borderColor: '#FFFFFF',
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sectionIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.surfaceTint,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 19,
    fontWeight: '900',
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  flex: {
    flex: 1,
  },
  targetGrid: {
    flexDirection: 'row',
    gap: 7,
  },
  target: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: 12,
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
    fontSize: 14,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  disclaimer: {
    color: theme.colors.textFaint,
    fontSize: 11,
    textAlign: 'center',
  },
});
