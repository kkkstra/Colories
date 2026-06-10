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
        <Text style={styles.eyebrow}>欢迎使用燃卡</Text>
        <Text style={styles.title}>先设定你的训练营养目标</Text>
        <Text style={styles.subtitle}>
          信息只保存在本机，用于计算每日热量与三大营养素建议。
        </Text>
      </View>

      <Card>
        <Text style={styles.sectionTitle}>身体信息</Text>
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

      <Card>
        <Text style={styles.sectionTitle}>活动水平</Text>
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

      <Card>
        <Text style={styles.sectionTitle}>当前目标</Text>
        <ChoiceChips
          value={goal}
          onChange={setGoal}
          options={[
            { label: '减脂', value: 'cut' },
            { label: '维持', value: 'maintain' },
            { label: '增肌', value: 'gain' },
          ]}
        />
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

      <AppButton label="开始记录" onPress={handleSave} loading={saving} />
    </Screen>
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
    gap: 8,
    paddingVertical: 16,
  },
  eyebrow: {
    color: theme.colors.accent,
    fontWeight: '800',
    letterSpacing: 1,
  },
  title: {
    color: theme.colors.text,
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '800',
  },
  subtitle: {
    color: theme.colors.textMuted,
    fontSize: 15,
    lineHeight: 23,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  fieldLabel: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '600',
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
    gap: 10,
    marginTop: 6,
  },
  target: {
    width: '47%',
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.small,
    padding: 12,
  },
  targetLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
  },
  targetValue: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '800',
    marginTop: 3,
  },
  disclaimer: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
});
