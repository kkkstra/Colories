import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { Card } from '@/components/ui/Card';
import { ChoiceChips } from '@/components/ui/ChoiceChips';
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
import {
  createDataExportFile,
  importDataFile,
  resetAllAppData,
  type DataExportResult,
  type DataImportResult,
  type ImportMode,
} from '@/lib/dataTransfer';
import { calculateTargets } from '@/lib/nutrition';
import { clearApiKey, getApiKey } from '@/lib/secureStorage';
import { syncTodayNutritionWidget } from '@/lib/widgetSync';
import type { DailyTargets, UserProfile } from '@/types/domain';

type ProviderFeedback = {
  tone: 'info' | 'success' | 'error';
  message: string;
};

type ExpandedSection = 'profile' | 'provider' | 'targets' | null;
type TransferBusy = 'export' | 'import' | 'clear' | null;

const DEFAULT_PROFILE: UserProfile = {
  age: 28,
  heightCm: 170,
  weightKg: 65,
  sex: 'male',
  activityLevel: 'moderate',
  goal: 'maintain',
};

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

const IMPORT_MODE_OPTIONS = [
  { label: '覆盖恢复', value: 'replace', icon: 'refresh' },
  { label: '合并追加', value: 'merge', icon: 'add-circle-outline' },
] as const;

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const {
    profile,
    targets,
    providerConfig,
    hasApiKey,
    refresh,
    persistProvider,
    persistProfile,
    persistTargets,
    clearQueuedMealItem,
  } = useApp();
  const [baseUrl, setBaseUrl] = useState(providerConfig?.baseUrl ?? DASHSCOPE_PRESET.baseUrl);
  const [model, setModel] = useState(providerConfig?.model ?? DASHSCOPE_PRESET.model);
  const [apiKey, setApiKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [providerFeedback, setProviderFeedback] = useState<ProviderFeedback | null>(null);
  const [targetDraft, setTargetDraft] = useState<DailyTargets>(
    targets ?? { calories: 2000, protein: 130, carbs: 240, fat: 60 },
  );
  const [profileDraft, setProfileDraft] = useState<UserProfile>(profile ?? DEFAULT_PROFILE);
  const [savingTargets, setSavingTargets] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [transferBusy, setTransferBusy] = useState<TransferBusy>(null);
  const [importMode, setImportMode] = useState<ImportMode>('replace');
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

  useEffect(() => {
    if (profile) {
      setProfileDraft(profile);
    }
  }, [profile]);

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

  const updateProfileNumber = (key: 'age' | 'heightCm' | 'weightKg', value: string) => {
    const parsed = Number(value);
    setProfileDraft((current) => ({
      ...current,
      [key]: Number.isFinite(parsed) ? Math.max(0, parsed) : 0,
    }));
  };

  const updateProfileChoice = <K extends 'sex' | 'activityLevel' | 'goal'>(
    key: K,
    value: UserProfile[K],
  ) => {
    setProfileDraft((current) => ({ ...current, [key]: value }));
  };

  const saveProfileWithTargets = async (
    nextProfile: UserProfile,
    nextTargets: DailyTargets,
    message: string,
  ) => {
    setSavingProfile(true);
    try {
      await persistProfile(nextProfile, nextTargets);
      setTargetDraft(nextTargets);
      setExpandedSection(null);
      showAlert(message);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveProfile = () => {
    if (
      profileDraft.age < 10 ||
      profileDraft.age > 100 ||
      profileDraft.heightCm < 80 ||
      profileDraft.heightCm > 240 ||
      profileDraft.weightKg < 25 ||
      profileDraft.weightKg > 300
    ) {
      showAlert('请检查身体信息', '年龄、身高或体重超出合理范围。');
      return;
    }

    const recommendedTargets = calculateTargets(profileDraft);
    showAlert(
      '重新制定目标？',
      `根据新的身体信息，推荐目标为：${Math.round(recommendedTargets.calories)} kcal，蛋白质 ${Math.round(recommendedTargets.protein)}g，碳水 ${Math.round(recommendedTargets.carbs)}g，脂肪 ${Math.round(recommendedTargets.fat)}g。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '只保存身体',
          onPress: () =>
            saveProfileWithTargets(
              profileDraft,
              targets ?? targetDraft,
              '身体信息已更新，目标保持不变。',
            ),
        },
        {
          text: '使用推荐目标',
          onPress: () =>
            saveProfileWithTargets(profileDraft, recommendedTargets, '身体和推荐目标已更新。'),
        },
      ],
    );
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

  const handleExportData = async () => {
    if (Platform.OS === 'web') {
      showAlert('导出暂不支持 Web', '请在 iOS 或 Android 使用系统分享导出备份文件。');
      return;
    }

    setTransferBusy('export');
    try {
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        showAlert('无法打开分享面板', '当前设备不支持系统文件分享。');
        return;
      }
      const exported = await createDataExportFile(db);
      await Sharing.shareAsync(exported.uri, {
        mimeType: 'application/json',
        UTI: 'public.json',
        dialogTitle: '导出燃卡数据',
      });
      showAlert('导出完成', formatExportResult(exported));
    } catch (error) {
      showAlert('导出失败', getErrorMessage(error));
    } finally {
      setTransferBusy(null);
    }
  };

  const handleImportData = () => {
    showAlert(
      importMode === 'replace' ? '覆盖恢复数据？' : '合并导入数据？',
      importMode === 'replace'
        ? '当前饮食记录、目标、自定义食物和 AI 配置会被备份替换，API Key 会被清除。'
        : '备份中的餐次、照片和自定义食物会追加到当前数据中。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: importMode === 'replace' ? '覆盖导入' : '合并导入',
          style: importMode === 'replace' ? 'destructive' : 'default',
          onPress: () => {
            void pickAndImportData();
          },
        },
      ],
    );
  };

  const pickAndImportData = async () => {
    setTransferBusy('import');
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        base64: false,
        copyToCacheDirectory: true,
        multiple: false,
        type: ['application/json', 'text/json', '*/*'],
      });
      if (picked.canceled) {
        return;
      }
      const asset = picked.assets[0];
      if (!asset) {
        showAlert('没有选择文件');
        return;
      }

      const imported = await importDataFile(db, asset.uri, importMode);
      if (importMode === 'replace') {
        await clearApiKey();
        setApiKey('');
      }
      await refresh();
      await syncTodayNutritionWidget(db);
      showAlert('导入完成', formatImportResult(imported));
    } catch (error) {
      showAlert('导入失败', getErrorMessage(error));
    } finally {
      setTransferBusy(null);
    }
  };

  const handleClearAllData = () => {
    showAlert(
      '清空所有数据？',
      '会删除饮食记录、身体信息、每日目标、自定义食物、AI 配置、API Key 和餐次照片。清空后会回到起始页。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '清空',
          style: 'destructive',
          onPress: () => {
            void clearAllData();
          },
        },
      ],
    );
  };

  const clearAllData = async () => {
    setTransferBusy('clear');
    try {
      await resetAllAppData(db);
      await clearApiKey();
      clearQueuedMealItem();
      setApiKey('');
      setProviderFeedback(null);
      await refresh();
      await syncTodayNutritionWidget(db);
      router.replace('/onboarding');
    } catch (error) {
      showAlert('清空失败', getErrorMessage(error));
    } finally {
      setTransferBusy(null);
    }
  };

  const recommendedTargets = calculateTargets(profileDraft);

  return (
    <Screen>
      <Text style={styles.title}>设置</Text>

      <Card style={styles.sectionCard}>
        <SectionSummary
          icon="person"
          title="身体"
          expanded={expandedSection === 'profile'}
          onPress={() => toggleSection('profile')}
        />

        <View style={styles.profileSummary}>
          <TargetMetric label="岁" value={profileDraft.age} color={theme.colors.primary} />
          <TargetMetric label="cm" value={profileDraft.heightCm} color={theme.colors.protein} />
          <TargetMetric label="kg" value={profileDraft.weightKg} color={theme.colors.fat} />
          <TargetMetric
            label="目标"
            value={recommendedTargets.calories}
            color={theme.colors.carbs}
          />
        </View>

        {expandedSection === 'profile' ? (
          <View style={styles.sectionBody}>
            <View style={styles.profileGrid}>
              <View style={styles.profileFieldFull}>
                <FormField
                  label="年龄"
                  value={String(profileDraft.age)}
                  onChangeText={(value) => updateProfileNumber('age', value)}
                  keyboardType="number-pad"
                  selectTextOnFocus
                />
              </View>
              <View style={styles.profileFieldHalf}>
                <FormField
                  label="身高 cm"
                  value={String(profileDraft.heightCm)}
                  onChangeText={(value) => updateProfileNumber('heightCm', value)}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                />
              </View>
              <View style={styles.profileFieldHalf}>
                <FormField
                  label="体重 kg"
                  value={String(profileDraft.weightKg)}
                  onChangeText={(value) => updateProfileNumber('weightKg', value)}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                />
              </View>
            </View>

            <View style={styles.choiceGroup}>
              <Text style={styles.groupLabel}>性别</Text>
              <ChoiceChips
                value={profileDraft.sex}
                onChange={(value) => updateProfileChoice('sex', value)}
                options={SEX_OPTIONS}
              />
            </View>
            <View style={styles.choiceGroup}>
              <Text style={styles.groupLabel}>活动</Text>
              <ChoiceChips
                value={profileDraft.activityLevel}
                onChange={(value) => updateProfileChoice('activityLevel', value)}
                options={ACTIVITY_OPTIONS}
              />
            </View>
            <View style={styles.choiceGroup}>
              <Text style={styles.groupLabel}>目标</Text>
              <ChoiceChips
                value={profileDraft.goal}
                onChange={(value) => updateProfileChoice('goal', value)}
                options={GOAL_OPTIONS}
              />
            </View>

            <View style={styles.recommendedBox}>
              <Text style={styles.recommendedTitle}>推荐目标</Text>
              <View style={styles.targetSummaryCompact}>
                <TargetMetric label="热" value={recommendedTargets.calories} color={theme.colors.primary} />
                <TargetMetric label="蛋" value={recommendedTargets.protein} color={theme.colors.protein} />
                <TargetMetric label="碳" value={recommendedTargets.carbs} color={theme.colors.carbs} />
                <TargetMetric label="脂" value={recommendedTargets.fat} color={theme.colors.fat} />
              </View>
            </View>

            <AppButton
              label="保存身体信息"
              icon="checkmark"
              onPress={handleSaveProfile}
              loading={savingProfile}
            />
          </View>
        ) : null}
      </Card>

      <Card style={styles.sectionCard}>
        <SectionSummary
          icon="speedometer"
          title="每日目标"
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
          onPress={() => router.push('/food-library')}
        />
      </Card>

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
        <View style={styles.transferPanel}>
          <View style={styles.transferHeader}>
            <Text style={styles.transferTitle}>备份</Text>
            <Text style={styles.transferMeta}>照片随备份保存，API Key 不导出</Text>
          </View>
          <View style={styles.importModeGroup}>
            <Text style={styles.groupLabel}>导入方式</Text>
            <ChoiceChips
              value={importMode}
              onChange={setImportMode}
              options={IMPORT_MODE_OPTIONS}
              adaptive
              columns={2}
            />
          </View>
          <View style={styles.transferActions}>
            <View style={styles.transferButton}>
              <AppButton
                label="导出数据"
                icon="download-outline"
                variant="secondary"
                onPress={handleExportData}
                loading={transferBusy === 'export'}
                disabled={transferBusy !== null}
              />
            </View>
            <View style={styles.transferButton}>
              <AppButton
                label="导入数据"
                icon="cloud-upload-outline"
                onPress={handleImportData}
                loading={transferBusy === 'import'}
                disabled={transferBusy !== null}
              />
            </View>
          </View>
          <AppButton
            label="清空所有数据"
            icon="trash-outline"
            variant="danger"
            onPress={handleClearAllData}
            loading={transferBusy === 'clear'}
            disabled={transferBusy !== null}
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
  value?: string;
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
        {value ? (
          <View style={styles.valueRow}>
            {active ? <View style={styles.activeDot} /> : null}
            <Text style={[styles.sectionValue, active && styles.sectionValueActive]} numberOfLines={1}>
              {value}
            </Text>
          </View>
        ) : null}
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
  value?: string;
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
        {value ? (
          <Text style={styles.sectionValue} numberOfLines={1}>
            {value}
          </Text>
        ) : null}
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

function formatExportResult(result: DataExportResult): string {
  const skipped = result.stats.skippedPhotos
    ? `，${result.stats.skippedPhotos} 张照片未找到`
    : '';
  return `已准备 ${result.stats.meals} 条饮食记录、${result.stats.customFoods} 个自定义食物和 ${result.stats.photos} 张照片${skipped}。`;
}

function formatImportResult(result: DataImportResult): string {
  const skipped = result.photosSkipped ? `，${result.photosSkipped} 张照片未恢复` : '';
  return `${result.mode === 'replace' ? '已覆盖恢复' : '已合并导入'} ${result.meals} 条饮食记录、${result.customFoods} 个自定义食物和 ${result.photosRestored} 张照片${skipped}。`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
  profileSummary: {
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  profileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingTop: 16,
  },
  profileFieldFull: {
    width: '100%',
  },
  profileFieldHalf: {
    flex: 1,
    minWidth: 0,
  },
  choiceGroup: {
    gap: 8,
  },
  groupLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '900',
  },
  recommendedBox: {
    gap: 10,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.surfaceTint,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    padding: 12,
  },
  recommendedTitle: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  targetSummaryCompact: {
    flexDirection: 'row',
    gap: 7,
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
  transferPanel: {
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    boxShadow: theme.shadows.small,
  },
  transferHeader: {
    gap: 3,
  },
  transferTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  transferMeta: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  importModeGroup: {
    gap: 8,
  },
  transferActions: {
    flexDirection: 'row',
    gap: 10,
  },
  transferButton: {
    flex: 1,
    minWidth: 0,
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
