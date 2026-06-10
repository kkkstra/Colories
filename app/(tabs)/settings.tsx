import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

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
import { calculateTargets } from '@/lib/nutrition';
import { clearApiKey } from '@/lib/secureStorage';
import type { DailyTargets } from '@/types/domain';

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
  const [targetDraft, setTargetDraft] = useState<DailyTargets>(
    targets ?? { calories: 2000, protein: 130, carbs: 240, fat: 60 },
  );
  const [savingTargets, setSavingTargets] = useState(false);

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
  };

  const handleTestAndSave = async () => {
    if (!baseUrl.trim() || !model.trim()) {
      Alert.alert('请填写 Base URL 和模型名');
      return;
    }
    if (!apiKey.trim()) {
      Alert.alert('请输入 API Key', hasApiKey ? '如需保留旧 Key，无需重新测试。' : undefined);
      return;
    }
    setTesting(true);
    try {
      const verified = await testProviderConfiguration(
        { baseUrl: baseUrl.trim(), model: model.trim() },
        apiKey.trim(),
      );
      await persistProvider(verified, apiKey.trim());
      setApiKey('');
      Alert.alert(
        '连接成功',
        `图片输入可用，结构化返回模式：${responseModeLabel(verified.responseMode)}。`,
      );
    } catch (error) {
      const message =
        error instanceof AIProviderError || error instanceof Error
          ? error.message
          : String(error);
      Alert.alert('测试失败', message);
    } finally {
      setTesting(false);
    }
  };

  const handleClearKey = () => {
    Alert.alert('清除 API Key？', '清除后拍照识别将暂停，手动记录不受影响。', [
      { text: '取消', style: 'cancel' },
      {
        text: '清除',
        style: 'destructive',
        onPress: async () => {
          await clearApiKey();
          setApiKey('');
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
      Alert.alert('目标已更新');
    } finally {
      setSavingTargets(false);
    }
  };

  const resetTargets = () => {
    if (profile) {
      setTargetDraft(calculateTargets(profile));
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.kicker}>SYSTEM / LOCAL FIRST</Text>
        <Text style={styles.title}>控制台</Text>
        <Text style={styles.subtitle}>你的数据留在本机，模型服务和密钥由你掌控。</Text>
      </View>

      <Card style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleGroup}>
            <Text style={styles.sectionNumber}>01</Text>
            <View>
              <Text style={styles.sectionEyebrow}>VISION PROVIDER</Text>
              <Text style={styles.sectionTitle}>AI 图片识别</Text>
            </View>
          </View>
          <View style={styles.statusWrap}>
            <View style={[styles.statusDot, hasApiKey && styles.statusDotReady]} />
            <Text style={[styles.statusText, hasApiKey && styles.statusReadyText]}>
              {hasApiKey ? '连接已保存' : '等待配置'}
            </Text>
          </View>
        </View>

        <Pressable onPress={useDashScopePreset} style={styles.preset}>
          <View style={styles.presetIcon}>
            <Text style={styles.presetMark}>QW</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.presetKicker}>RECOMMENDED PRESET</Text>
            <Text style={styles.presetTitle}>阿里云百炼视觉模型</Text>
            <Text style={styles.muted}>北京地域 · OpenAI 兼容接口</Text>
          </View>
          <Ionicons name="arrow-forward" size={19} color={theme.colors.primary} />
        </Pressable>

        <FormField
          label="Base URL"
          value={baseUrl}
          onChangeText={setBaseUrl}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="https://example.com/v1"
          hint="App 会在末尾补充 /chat/completions；也可直接填写完整地址。"
        />
        <FormField
          label="模型名"
          value={model}
          onChangeText={setModel}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="支持图片输入的模型 ID"
        />
        <FormField
          label={hasApiKey ? '替换 API Key' : 'API Key'}
          value={apiKey}
          onChangeText={setApiKey}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          placeholder={hasApiKey ? '已安全保存；留空表示不替换' : 'sk-...'}
          hint="密钥只写入 iOS Keychain / Android Keystore，不写入 SQLite 或日志。"
        />
        <AppButton
          label="测试连接并保存"
          icon="flash-outline"
          onPress={handleTestAndSave}
          loading={testing}
        />
        {providerConfig ? (
          <View style={styles.modeRow}>
            <Text style={styles.modeLabel}>STRUCTURED OUTPUT</Text>
            <Text style={styles.modeValue}>{responseModeLabel(providerConfig.responseMode)}</Text>
          </View>
        ) : null}
        {hasApiKey ? (
          <Pressable onPress={handleClearKey}>
            <Text style={styles.clearKey}>清除本机 API Key</Text>
          </Pressable>
        ) : null}
      </Card>

      <Card style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleGroup}>
            <Text style={[styles.sectionNumber, styles.sectionNumberOrange]}>02</Text>
            <View>
              <Text style={styles.sectionEyebrow}>DAILY TARGETS</Text>
              <Text style={styles.sectionTitle}>每日目标</Text>
            </View>
          </View>
          <Pressable onPress={resetTargets}>
            <Text style={styles.reset}>按身体信息重算</Text>
          </Pressable>
        </View>
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
        <AppButton
          label="保存每日目标"
          variant="secondary"
          onPress={handleSaveTargets}
          loading={savingTargets}
        />
      </Card>

      {profile ? (
        <View style={styles.profilePanel}>
          <View>
            <Text style={styles.profileEyebrow}>ATHLETE PROFILE</Text>
            <Text style={styles.profileTitle}>身体参数</Text>
          </View>
          <View style={styles.profileStats}>
            <ProfileStat label="年龄" value={`${profile.age}`} />
            <ProfileStat label="身高" value={`${profile.heightCm}`} />
            <ProfileStat label="体重" value={`${profile.weightKg}`} />
            <ProfileStat
              label="目标"
              value={profile.goal === 'cut' ? '减脂' : profile.goal === 'gain' ? '增肌' : '维持'}
            />
          </View>
          <Text style={styles.profileNote}>仅用于本机计算，不会上传到模型服务。</Text>
        </View>
      ) : null}

      <View style={styles.privacySection}>
        <View style={styles.sectionTitleGroup}>
          <Text style={[styles.sectionNumber, styles.sectionNumberMuted]}>03</Text>
          <View>
            <Text style={styles.sectionEyebrow}>DATA CONTROL</Text>
            <Text style={styles.sectionTitle}>数据与隐私</Text>
          </View>
        </View>
        <InfoRow icon="phone-portrait-outline" text="饮食记录、身体信息和缩略图保存在本机。" />
        <InfoRow icon="cloud-upload-outline" text="只有待识别的压缩照片会发送到你配置的模型服务。" />
        <InfoRow icon="shield-checkmark-outline" text="卸载 App 会删除 SQLite 数据；iOS Keychain 中的密钥可能按系统规则保留。" />
        <Text style={styles.disclaimer}>
          本应用提供的食物识别和营养数据仅为估算，不用于医疗诊断、治疗或处方。
        </Text>
      </View>
    </Screen>
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

function InfoRow({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={18} color={theme.colors.primary} />
      </View>
      <Text style={styles.infoText}>{text}</Text>
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

function responseModeLabel(mode: string): string {
  if (mode === 'json_schema') return 'JSON Schema';
  if (mode === 'json_object') return 'JSON Object';
  return '提示词 JSON';
}

const styles = StyleSheet.create({
  header: {
    gap: 5,
    marginTop: 4,
  },
  kicker: {
    color: theme.colors.primary,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  title: {
    color: theme.colors.text,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '900',
    letterSpacing: -1.2,
  },
  subtitle: {
    color: theme.colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  sectionCard: {
    padding: 20,
    gap: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  sectionTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sectionNumber: {
    width: 37,
    height: 37,
    borderRadius: 9,
    backgroundColor: theme.colors.primary,
    color: '#FFFFFF',
    textAlign: 'center',
    textAlignVertical: 'center',
    lineHeight: 37,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  sectionNumberOrange: {
    backgroundColor: theme.colors.accent,
  },
  sectionNumberMuted: {
    backgroundColor: theme.colors.ink,
  },
  sectionEyebrow: {
    color: theme.colors.textFaint,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.1,
    marginBottom: 2,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 19,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  statusWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 2,
    backgroundColor: theme.colors.accent,
  },
  statusDotReady: {
    backgroundColor: theme.colors.success,
  },
  statusText: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: '900',
  },
  statusReadyText: {
    color: theme.colors.success,
  },
  preset: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    padding: 15,
    backgroundColor: theme.colors.primarySoft,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  presetIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetMark: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  presetKicker: {
    color: theme.colors.primary,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
  },
  presetTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '900',
    marginTop: 2,
  },
  flex: {
    flex: 1,
  },
  muted: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  clearKey: {
    color: theme.colors.danger,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '800',
    paddingVertical: 5,
  },
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  modeLabel: {
    color: theme.colors.textFaint,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  modeValue: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '900',
  },
  reset: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  targetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  targetField: {
    width: '47%',
    flexGrow: 1,
  },
  profilePanel: {
    backgroundColor: theme.colors.ink,
    borderRadius: theme.radius.large,
    padding: 20,
    gap: 16,
  },
  profileEyebrow: {
    color: '#98A2B3',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  profileTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    marginTop: 3,
  },
  profileStats: {
    flexDirection: 'row',
    gap: 8,
  },
  profileStat: {
    flex: 1,
    paddingTop: 10,
    borderTopWidth: 3,
    borderTopColor: theme.colors.primary,
  },
  profileStatValue: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  profileStatLabel: {
    color: '#98A2B3',
    fontSize: 10,
    marginTop: 3,
  },
  profileNote: {
    color: '#AEB9CD',
    fontSize: 11,
  },
  privacySection: {
    gap: 13,
    paddingHorizontal: 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  infoIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoText: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 13,
    lineHeight: 20,
  },
  disclaimer: {
    color: theme.colors.warning,
    backgroundColor: theme.colors.warningSoft,
    borderRadius: theme.radius.small,
    padding: 13,
    fontSize: 12,
    lineHeight: 18,
  },
});
