import { Redirect, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { Card } from '@/components/ui/Card';
import { ChoiceChips } from '@/components/ui/ChoiceChips';
import { FormField } from '@/components/ui/FormField';
import { Screen } from '@/components/ui/Screen';
import { theme } from '@/constants/Theme';
import { useApp } from '@/context/AppContext';
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
      Alert.alert('请检查身体信息', '年龄、身高或体重超出合理范围。');
      return;
    }
    setSaving(true);
    try {
      await persistProfile(draft, targets);
      router.replace('/');
    } catch (error) {
      Alert.alert('保存失败', error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={styles.heroGlyph}>燃</Text>
        <View style={styles.heroMark}>
          <Text style={styles.heroMarkText}>RK</Text>
        </View>
        <Text style={styles.eyebrow}>WELCOME / DAILY FUEL</Text>
        <Text style={styles.title}>先校准你的{'\n'}营养训练目标</Text>
        <Text style={styles.subtitle}>身体信息只保存在本机，用来计算每日建议。</Text>
      </View>

      <Card style={styles.sectionCard}>
        <SectionTitle index="01" eyebrow="BODY DATA" title="身体信息" />
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
              label="身高 (cm)"
              value={height}
              onChangeText={setHeight}
              keyboardType="decimal-pad"
            />
          </View>
        </View>
        <FormField
          label="体重 (kg)"
          value={weight}
          onChangeText={setWeight}
          keyboardType="decimal-pad"
        />
        <Text style={styles.fieldLabel}>生理性别</Text>
        <ChoiceChips
          value={sex}
          onChange={setSex}
          options={[
            { label: '男性', value: 'male' },
            { label: '女性', value: 'female' },
          ]}
        />
      </Card>

      <Card style={styles.sectionCard}>
        <SectionTitle index="02" eyebrow="TRAINING LOAD" title="活动水平" />
        <ChoiceChips
          value={activityLevel}
          onChange={setActivityLevel}
          options={[
            { label: '久坐', value: 'sedentary' },
            { label: '轻度活动', value: 'light' },
            { label: '每周训练 3–5 次', value: 'moderate' },
            { label: '高强度训练', value: 'active' },
            { label: '运动员级别', value: 'very_active' },
          ]}
        />
      </Card>

      <Card style={styles.sectionCard}>
        <SectionTitle index="03" eyebrow="GOAL MODE" title="当前目标" />
        <ChoiceChips
          value={goal}
          onChange={setGoal}
          options={[
            { label: '减脂', value: 'cut' },
            { label: '维持', value: 'maintain' },
            { label: '增肌', value: 'gain' },
          ]}
        />
        <View style={styles.targetHeader}>
          <Text style={styles.targetHeaderLabel}>CALCULATED TARGETS</Text>
          <Text style={styles.targetHeaderHint}>可稍后在设置中调整</Text>
        </View>
        <View style={styles.targetGrid}>
          <Target label="热量" value={`${targets.calories} kcal`} />
          <Target label="蛋白质" value={`${targets.protein} g`} />
          <Target label="碳水" value={`${targets.carbs} g`} />
          <Target label="脂肪" value={`${targets.fat} g`} />
        </View>
        <Text style={styles.disclaimer}>
          基于 Mifflin-St Jeor 公式估算。结果仅供日常饮食记录，不用于医疗决策。
        </Text>
      </Card>

      <AppButton label="保存目标，开始记录" icon="arrow-forward" onPress={handleSave} loading={saving} />
    </Screen>
  );
}

function SectionTitle({
  index,
  eyebrow,
  title,
}: {
  index: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <View style={styles.sectionHeading}>
      <Text style={styles.sectionIndex}>{index}</Text>
      <View>
        <Text style={styles.sectionEyebrow}>{eyebrow}</Text>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
    </View>
  );
}

function Target({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.target}>
      <Text style={styles.targetLabel}>{label}</Text>
      <Text style={styles.targetValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    minHeight: 278,
    gap: 8,
    padding: 24,
    borderRadius: theme.radius.large,
    backgroundColor: theme.colors.ink,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  heroGlyph: {
    position: 'absolute',
    right: -20,
    top: -42,
    color: '#24304A',
    fontSize: 190,
    lineHeight: 220,
    fontWeight: '900',
  },
  heroMark: {
    position: 'absolute',
    top: 20,
    left: 22,
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-5deg' }],
  },
  heroMarkText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  eyebrow: {
    color: '#AEBBFF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 34,
    lineHeight: 42,
    fontWeight: '900',
    letterSpacing: -1,
  },
  subtitle: {
    color: '#AEB9CD',
    fontSize: 13,
    lineHeight: 20,
  },
  sectionCard: {
    padding: 20,
    gap: 16,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sectionIndex: {
    width: 36,
    height: 36,
    borderRadius: 9,
    backgroundColor: theme.colors.primary,
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 36,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  sectionEyebrow: {
    color: theme.colors.textFaint,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 19,
    fontWeight: '900',
    marginTop: 2,
  },
  fieldLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  flex: {
    flex: 1,
  },
  targetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  targetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 5,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  targetHeaderLabel: {
    color: theme.colors.primary,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },
  targetHeaderHint: {
    color: theme.colors.textFaint,
    fontSize: 9,
    fontWeight: '700',
  },
  target: {
    width: '47%',
    backgroundColor: theme.colors.background,
    borderRadius: 9,
    padding: 13,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  targetLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
  },
  targetValue: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 3,
  },
  disclaimer: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
});
