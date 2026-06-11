import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';
import { Screen } from '@/components/ui/Screen';
import { theme } from '@/constants/Theme';
import { useApp } from '@/context/AppContext';
import {
  AIProviderError,
  DASHSCOPE_PRESET,
  testProviderConfiguration,
} from '@/lib/ai';
import { showAlert } from '@/lib/alert';
import { calculateTargets } from '@/lib/nutrition';
import { clearApiKey, getApiKey } from '@/lib/secureStorage';
import type { DailyTargets } from '@/types/domain';

type ProviderFeedback = {
  tone: 'info' | 'success' | 'error';
  message: string;
};

type ExpandedSection = 'provider' | 'targets' | null;

export default function SettingsScreen() {
  const {
    profile,
    targets,
    providerConfig,
    hasApiKey,
    refresh,
    persistProvider,
    persistTargets,
  } = useApp();
  const [baseUrl, setBaseUrl] = useState(providerConfig?.baseUrl ?? DASHSCOPE_PRESET.baseUrl);
  const [model, setModel] = useState(providerConfig?.model ?? DASHSCOPE_PRESET.model);
  const [apiKey, setApiKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [providerFeedback, setProviderFeedback] = useState<ProviderFeedback | null>(null);
  const [targetDraft, setTargetDraft] = useState<DailyTargets>(
    targets ?? { calories: 2000, protein: 130, carbs: 240, fat: 60 },
  );
  const [savingTargets, setSavingTargets] = useState(false);
  const [expandedSection, setExpandedSection] = useState<ExpandedSection>(
    hasApiKey ? null : 'provider',
  );

  useEffect(() => {
    if (providerConfig) {
      setBaseUrl(providerConfig.baseUrl);
      setModel(providerConfig.model);
    }
  }, [providerConfig]);

  useEffect(() => {
    if (targets) {
      setTargetDraft(targets);
    }
  }, [targets]);

  const useDashScopePreset = () => {
    setBaseUrl(DASHSCOPE_PRESET.baseUrl);
    setModel(DASHSCOPE_PRESET.model);
    setProviderFeedback(null);
  };

  const handleTestAndSave = async () => {
    if (!baseUrl.trim() || !model.trim()) {
      setProviderFeedback({ tone: 'error', message: '请填写 Base URL 和模型名。' });
      return;
    }
    setTesting(true);
    setProviderFeedback({ tone: 'info', message: '正在验证图片输入与结构化输出…' });
    try {
      const nextApiKey = apiKey.trim() || (hasApiKey ? await getApiKey() : null);
      if (!nextApiKey) {
        setProviderFeedback({ tone: 'error', message: '请输入 API Key。' });
        return;
      }
      const verified = await testProviderConfiguration(
        { baseUrl: baseUrl.trim(), model: model.trim() },
        nextApiKey,
      );
      await persistProvider(verified, nextApiKey);
      setApiKey('');
      setProviderFeedback({
        tone: 'success',
        message: `连接成功 · ${responseModeLabel(verified.responseMode)}`,
      });
    } catch (error) {
      const message =
        error instanceof AIProviderError || error instanceof Error
          ? error.message
          : String(error);
      setProviderFeedback({ tone: 'error', message: `测试失败：${message}` });
    } finally {
      setTesting(false);
    }
  };

  const handleClearKey = () => {
    showAlert('清除 API Key？', '清除后拍照识别将暂停，手动记录不受影响。', [
      { text: '取消', style: 'cancel' },
      {
        text: '清除',
        style: 'destructive',
        onPress: async () => {
          await clearApiKey();
          setApiKey('');
          setProviderFeedback(null);
          await refresh();
        },
      },
    ]);
  };

  const updateTarget = (key: keyof DailyTargets, value: string) => {
    const parsed = Number(value);
    setTargetDraft((current) => ({
      ...current,
      [key]: Number.isFinite(parsed) ? Math.max(0, parsed) : 0,
    }));
  };

  const handleSaveTargets = async () => {
    setSavingTargets(true);
    try {
      await persistTargets(targetDraft);
      showAlert('目标已更新');
      setExpandedSection(null);
    } finally {
      setSavingTargets(false);
    }
  };

  const resetTargets = () => {
    if (profile) {
      setTargetDraft(calculateTargets(profile));
    }
  };

  const toggleSection = (section: Exclude<ExpandedSection, null>) => {
    setExpandedSection((current) => (current === section ? null : section));
  };

  return (
    <Screen>
      <Text style={styles.title}>设置</Text>

      <Card style={styles.sectionCard}>
        <SectionSummary
          icon="sparkles"
          title="AI 识别"
          value={hasApiKey ? providerConfig?.model ?? '已连接' : '未配置'}
          active={hasApiKey}
          expanded={expandedSection === 'provider'}
          onPress={() => toggleSection('provider')}
        />

        {expandedSection === 'provider' ? (
          <View style={styles.sectionBody}>
            <Pressable
              accessibilityRole="button"
              onPress={useDashScopePreset}
              style={({ pressed }) => [styles.preset, pressed && styles.pressed]}
            >
              <View style={styles.presetIcon}>
                <Text style={styles.presetMark}>QW</Text>
              </View>
              <Text style={styles.presetTitle}>使用百炼预设</Text>
              <Ionicons name="arrow-forward" size={18} color={theme.colors.primary} />
            </Pressable>

            <FormField
              label="Base URL"
              value={baseUrl}
              onChangeText={(value) => {
                setBaseUrl(value);
                setProviderFeedback(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="https://example.com/v1"
            />
            <FormField
              label="模型"
              value={model}
              onChangeText={(value) => {
                setModel(value);
                setProviderFeedback(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="支持图片输入的模型 ID"
            />
            <FormField
              label={hasApiKey ? '替换 API Key' : 'API Key'}
              value={apiKey}
              onChangeText={(value) => {
                setApiKey(value);
                setProviderFeedback(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              placeholder={hasApiKey ? '已安全保存' : 'sk-…'}
            />
            <AppButton
              label="测试并保存"
              icon="flash-outline"
              onPress={handleTestAndSave}
              loading={testing}
            />

            {providerFeedback ? (
              <View
                accessibilityRole="alert"
                style={[
                  styles.feedback,
                  providerFeedback.tone === 'success' && styles.feedbackSuccess,
                  providerFeedback.tone === 'error' && styles.feedbackError,
                ]}
              >
                <Ionicons
                  name={
                    providerFeedback.tone === 'success'
                      ? 'checkmark-circle'
                      : providerFeedback.tone === 'error'
                        ? 'alert-circle'
                        : 'time'
                  }
                  size={18}
                  color={
                    providerFeedback.tone === 'success'
                      ? theme.colors.success
                      : providerFeedback.tone === 'error'
                        ? theme.colors.danger
                        : theme.colors.primary
                  }
                />
                <Text selectable style={styles.feedbackText}>
                  {providerFeedback.message}
                </Text>
              </View>
            ) : null}

            {providerConfig ? (
              <View style={styles.modeRow}>
                <Ionicons name="code-slash-outline" size={17} color={theme.colors.textMuted} />
                <Text style={styles.modeValue}>
                  {responseModeLabel(providerConfig.responseMode)}
                </Text>
              </View>
            ) : null}

            {hasApiKey ? (
              <Pressable accessibilityRole="button" onPress={handleClearKey}>
                <Text style={styles.clearKey}>清除 API Key</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </Card>

      <Card style={styles.sectionCard}>
        <SectionSummary
          icon="speedometer"
          title="每日目标"
          value={`${Math.round(targetDraft.calories)} kcal`}
          expanded={expandedSection === 'targets'}
          onPress={() => toggleSection('targets')}
        />

        <View style={styles.targetSummary}>
          <TargetMetric label="热" value={targetDraft.calories} color={theme.colors.primary} />
          <TargetMetric label="蛋" value={targetDraft.protein} color={theme.colors.protein} />
          <TargetMetric label="碳" value={targetDraft.carbs} color={theme.colors.carbs} />
          <TargetMetric label="脂" value={targetDraft.fat} color={theme.colors.fat} />
        </View>

        {expandedSection === 'targets' ? (
          <View style={styles.sectionBody}>
            <View style={styles.targetGrid}>
              <TargetField
                label="热量 kcal"
                value={targetDraft.calories}
                onChange={(value) => updateTarget('calories', value)}
              />
              <TargetField
                label="蛋白质 g"
                value={targetDraft.protein}
                onChange={(value) => updateTarget('protein', value)}
              />
              <TargetField
                label="碳水 g"
                value={targetDraft.carbs}
                onChange={(value) => updateTarget('carbs', value)}
              />
              <TargetField
                label="脂肪 g"
                value={targetDraft.fat}
                onChange={(value) => updateTarget('fat', value)}
              />
            </View>
            <View style={styles.targetActions}>
              <Pressable
                accessibilityRole="button"
                onPress={resetTargets}
                style={styles.resetButton}
              >
                <Ionicons name="refresh" size={17} color={theme.colors.primary} />
                <Text style={styles.resetText}>重算</Text>
              </Pressable>
              <View style={styles.saveTargetButton}>
                <AppButton
                  label="保存目标"
                  onPress={handleSaveTargets}
                  loading={savingTargets}
                />
              </View>
            </View>
          </View>
        ) : null}
      </Card>

      <Card style={styles.sectionCard}>
        <NavigationSummary
          icon="library-outline"
          title="食物库"
          value="预置来源可追溯，也可维护自己的食物"
          onPress={() => router.push('/food-library')}
        />
      </Card>

      {profile ? (
        <Card style={styles.profileCard}>
          <View style={styles.profileHeader}>
            <View style={styles.profileIcon}>
              <Ionicons name="person-outline" size={20} color="#FFFFFF" />
            </View>
            <Text style={styles.profileTitle}>身体</Text>
          </View>
          <View style={styles.profileStats}>
            <ProfileStat label="岁" value={`${profile.age}`} />
            <ProfileStat label="cm" value={`${profile.heightCm}`} />
            <ProfileStat label="kg" value={`${profile.weightKg}`} />
            <ProfileStat
              label="目标"
              value={profile.goal === 'cut' ? '减脂' : profile.goal === 'gain' ? '增肌' : '维持'}
            />
          </View>
        </Card>
      ) : null}

      <View style={styles.privacySection}>
        <Text style={styles.privacyTitle}>数据与隐私</Text>
        <View style={styles.privacyGrid}>
          <PrivacyTile
            icon="phone-portrait-outline"
            label="本机保存"
            accessibilityLabel="饮食记录、身体信息和缩略图保存在本机"
          />
          <PrivacyTile
            icon="image-outline"
            label="仅传照片"
            accessibilityLabel="只有待识别的压缩照片会发送到配置的模型服务"
          />
          <PrivacyTile
            icon="key-outline"
            label="密钥加密"
            accessibilityLabel="API Key 保存在系统安全存储中"
          />
        </View>
        <View style={styles.disclaimer}>
          <Ionicons name="information-circle-outline" size={17} color={theme.colors.warning} />
          <Text style={styles.disclaimerText}>识别和营养结果仅供日常记录。</Text>
        </View>
      </View>
    </Screen>
  );
}

function SectionSummary({
  icon,
  title,
  value,
  active = false,
  expanded,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  value: string;
  active?: boolean;
  expanded: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      onPress={onPress}
      style={({ pressed }) => [styles.sectionSummary, pressed && styles.pressed]}
    >
      <View style={styles.sectionIcon}>
        <Ionicons name={icon} size={22} color={theme.colors.primary} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.valueRow}>
          {active ? <View style={styles.activeDot} /> : null}
          <Text style={[styles.sectionValue, active && styles.sectionValueActive]} numberOfLines={1}>
            {value}
          </Text>
        </View>
      </View>
      <Ionicons
        name={expanded ? 'chevron-up' : 'chevron-down'}
        size={19}
        color={theme.colors.textFaint}
      />
    </Pressable>
  );
}

function NavigationSummary({
  icon,
  title,
  value,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.sectionSummary, pressed && styles.pressed]}
    >
      <View style={styles.sectionIcon}>
        <Ionicons name={icon} size={22} color={theme.colors.primary} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionValue} numberOfLines={1}>
          {value}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={19} color={theme.colors.textFaint} />
    </Pressable>
  );
}

function TargetField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.targetField}>
      <FormField
        label={label}
        value={String(value)}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        selectTextOnFocus
      />
    </View>
  );
}

function TargetMetric({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <View style={styles.targetMetric}>
      <View style={[styles.targetDot, { backgroundColor: color }]} />
      <Text style={styles.targetMetricLabel}>{label}</Text>
      <Text style={styles.targetMetricValue}>{Math.round(value)}</Text>
    </View>
  );
}

function ProfileStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.profileStat}>
      <Text style={styles.profileStatValue}>{value}</Text>
      <Text style={styles.profileStatLabel}>{label}</Text>
    </View>
  );
}

function PrivacyTile({
  icon,
  label,
  accessibilityLabel,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  accessibilityLabel: string;
}) {
  return (
    <View accessibilityLabel={accessibilityLabel} style={styles.privacyTile}>
      <Ionicons name={icon} size={23} color={theme.colors.primary} />
      <Text style={styles.privacyLabel}>{label}</Text>
    </View>
  );
}

function responseModeLabel(mode: string): string {
  if (mode === 'json_schema') return 'JSON Schema';
  if (mode === 'json_object') return 'JSON Object';
  return '提示词 JSON';
}

const styles = StyleSheet.create({
  title: {
    color: theme.colors.text,
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -1.1,
    marginTop: 2,
  },
  sectionCard: {
    padding: 0,
    gap: 0,
    overflow: 'hidden',
    borderColor: '#FFFFFF',
  },
  sectionSummary: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    padding: 16,
  },
  sectionIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.surfaceTint,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: {
    flex: 1,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  activeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: theme.colors.success,
  },
  sectionValue: {
    flex: 1,
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  sectionValueActive: {
    color: theme.colors.success,
  },
  sectionBody: {
    gap: 14,
    padding: 16,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSoft,
  },
  preset: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 11,
    marginTop: 16,
    backgroundColor: theme.colors.primarySoft,
    borderRadius: 14,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: '#D9E2FF',
  },
  presetIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetMark: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  presetTitle: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.72,
  },
  feedback: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    padding: 12,
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.primarySoft,
    borderWidth: 1,
    borderColor: '#D9E2FF',
  },
  feedbackSuccess: {
    backgroundColor: theme.colors.successSoft,
  },
  feedbackError: {
    backgroundColor: theme.colors.accentSoft,
  },
  feedbackText: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modeValue: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  clearKey: {
    color: theme.colors.danger,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '800',
    paddingVertical: 4,
  },
  targetSummary: {
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  targetMetric: {
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
  targetMetricLabel: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
  },
  targetMetricValue: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  targetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingTop: 16,
  },
  targetField: {
    width: '47%',
    flexGrow: 1,
  },
  targetActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  resetButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 15,
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.primarySoft,
    boxShadow: theme.shadows.small,
  },
  resetText: {
    color: theme.colors.primary,
    fontSize: 13,
    fontWeight: '900',
  },
  saveTargetButton: {
    flex: 1,
  },
  profileCard: {
    backgroundColor: theme.colors.ink,
    borderColor: theme.colors.ink,
    gap: 16,
    boxShadow: theme.shadows.large,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  profileIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },
  profileStats: {
    flexDirection: 'row',
    gap: 8,
  },
  profileStat: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 3,
    borderTopColor: theme.colors.primary,
  },
  profileStatValue: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  profileStatLabel: {
    color: '#98A2B3',
    fontSize: 9,
    marginTop: 3,
  },
  privacySection: {
    gap: 12,
    padding: 16,
    borderRadius: theme.radius.medium,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.surfaceInset,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
  },
  privacyTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  privacyGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  privacyTile: {
    flex: 1,
    minHeight: 78,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    boxShadow: theme.shadows.small,
  },
  privacyLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
  },
  disclaimer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.warningSoft,
  },
  disclaimerText: {
    color: theme.colors.warning,
    fontSize: 12,
    fontWeight: '700',
  },
});
