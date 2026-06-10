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
      <View>
        <Text style={styles.kicker}>本地优先 · BYOK</Text>
        <Text style={styles.title}>设置</Text>
      </View>

      <Card>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>AI 图片识别</Text>
          <View style={[styles.status, hasApiKey ? styles.statusReady : styles.statusMissing]}>
            <Text style={[styles.statusText, hasApiKey && styles.statusReadyText]}>
              {hasApiKey ? '已配置' : '未配置'}
            </Text>
          </View>
        </View>

        <Pressable onPress={useDashScopePreset} style={styles.preset}>
          <View style={styles.presetIcon}>
            <Ionicons name="sparkles" size={20} color={theme.colors.primary} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.presetTitle}>使用阿里云百炼预设</Text>
            <Text style={styles.muted}>北京地域 OpenAI 兼容接口</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
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
        <AppButton label="测试并保存" onPress={handleTestAndSave} loading={testing} />
        {providerConfig ? (
          <Text style={styles.muted}>
            当前返回模式：{responseModeLabel(providerConfig.responseMode)}
          </Text>
        ) : null}
        {hasApiKey ? (
          <Pressable onPress={handleClearKey}>
            <Text style={styles.clearKey}>清除本机 API Key</Text>
          </Pressable>
        ) : null}
      </Card>

      <Card>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>每日目标</Text>
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
        <Card>
          <Text style={styles.sectionTitle}>身体信息</Text>
          <Text style={styles.profileText}>
            {profile.age} 岁 · {profile.heightCm} cm · {profile.weightKg} kg ·{' '}
            {profile.goal === 'cut' ? '减脂' : profile.goal === 'gain' ? '增肌' : '维持'}
          </Text>
          <Text style={styles.muted}>
            身体信息用于 Mifflin-St Jeor 公式计算，不会上传到 AI 服务。
          </Text>
        </Card>
      ) : null}

      <Card>
        <Text style={styles.sectionTitle}>数据与隐私</Text>
        <InfoRow icon="phone-portrait-outline" text="饮食记录、身体信息和缩略图保存在本机。" />
        <InfoRow icon="cloud-upload-outline" text="只有待识别的压缩照片会发送到你配置的模型服务。" />
        <InfoRow icon="shield-checkmark-outline" text="卸载 App 会删除 SQLite 数据；iOS Keychain 中的密钥可能按系统规则保留。" />
        <Text style={styles.disclaimer}>
          本应用提供的食物识别和营养数据仅为估算，不用于医疗诊断、治疗或处方。
        </Text>
      </Card>
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
      <Ionicons name={icon} size={20} color={theme.colors.primary} />
      <Text style={styles.infoText}>{text}</Text>
    </View>
  );
}

function responseModeLabel(mode: string): string {
  if (mode === 'json_schema') return 'JSON Schema';
  if (mode === 'json_object') return 'JSON Object';
  return '提示词 JSON';
}

const styles = StyleSheet.create({
  kicker: {
    color: theme.colors.accent,
    fontWeight: '800',
  },
  title: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: '800',
    marginTop: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  status: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusReady: {
    backgroundColor: theme.colors.primarySoft,
  },
  statusMissing: {
    backgroundColor: '#F1E8E7',
  },
  statusText: {
    color: theme.colors.danger,
    fontSize: 11,
    fontWeight: '800',
  },
  statusReadyText: {
    color: theme.colors.primary,
  },
  preset: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.small,
  },
  presetIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetTitle: {
    color: theme.colors.text,
    fontWeight: '800',
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
    fontWeight: '700',
    paddingVertical: 5,
  },
  reset: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: '700',
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
  profileText: {
    color: theme.colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  infoText: {
    flex: 1,
    color: theme.colors.text,
    lineHeight: 21,
  },
  disclaimer: {
    color: theme.colors.warning,
    backgroundColor: '#FFF8EA',
    borderRadius: theme.radius.small,
    padding: 10,
    fontSize: 12,
    lineHeight: 18,
  },
});
