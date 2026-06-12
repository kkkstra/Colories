import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { MealItemEditor } from '@/components/MealItemEditor';
import { HeaderIconButton } from '@/components/ui/AppHeader';
import { Card } from '@/components/ui/Card';
import { ChoiceChips } from '@/components/ui/ChoiceChips';
import { MealDateTimePicker } from '@/components/ui/MealDateTimePicker';
import { MealTotalSummary } from '@/components/ui/MealTotalSummary';
import { PhotoGallery, type PhotoGalleryItem } from '@/components/ui/PhotoGallery';
import { Screen } from '@/components/ui/Screen';
import { theme } from '@/constants/Theme';
import { RECORD_MEAL_ITEM_TARGET, useApp } from '@/context/AppContext';
import { AIProviderError, recognizeFoodImages } from '@/lib/ai';
import { showAlert } from '@/lib/alert';
import { findFoodMatch, saveCustomFood, saveMeal } from '@/lib/database';
import {
  deleteStoredPhoto,
  prepareFoodImage,
  resolveStoredPhotoUri,
  type PreparedFoodImage,
} from '@/lib/image';
import {
  createCustomFoodInputFromMealItem,
  createMealItemDraftFromRecognition,
} from '@/lib/mealItemDrafts';
import { inferMealTypeFromDate } from '@/lib/mealTiming';
import { createMealTitle, resolveMealTitle } from '@/lib/mealTitle';
import { sumMacros } from '@/lib/nutrition';
import { getApiKey } from '@/lib/secureStorage';
import { syncTodayNutritionWidget } from '@/lib/widgetSync';
import type { MealItemDraft, MealType } from '@/types/domain';

const MAX_MEAL_PHOTOS = 6;
type ProcessingState = 'preparing' | 'recognizing' | null;

export default function RecordScreen() {
  const db = useSQLiteContext();
  const {
    loading,
    profile,
    providerConfig,
    hasApiKey,
    queuedMealItem,
    clearQueuedMealItem,
  } = useApp();
  const [mealType, setMealType] = useState<MealType>(() => inferMealTypeFromDate());
  const [eatenAt, setEatenAt] = useState(() => new Date());
  const [mealTitle, setMealTitle] = useState('');
  const [items, setItems] = useState<MealItemDraft[]>([]);
  const [foodImages, setFoodImages] = useState<PreparedFoodImage[]>([]);
  const [notes, setNotes] = useState('');
  const [processing, setProcessing] = useState<ProcessingState>(null);
  const [recognitionElapsedSeconds, setRecognitionElapsedSeconds] = useState(0);
  const [saving, setSaving] = useState(false);
  const [catalogSavingId, setCatalogSavingId] = useState<string>();
  const busy = processing !== null;
  const hasDraftContent =
    foodImages.length > 0 || items.length > 0 || mealTitle.trim().length > 0 || notes.trim().length > 0;

  useEffect(() => {
    if (!queuedMealItem || queuedMealItem.target !== RECORD_MEAL_ITEM_TARGET) {
      return;
    }
    setItems((current) => [...current, queuedMealItem.item]);
    clearQueuedMealItem();
  }, [clearQueuedMealItem, queuedMealItem]);

  useEffect(() => {
    if (items.length === 0 || mealTitle.trim()) {
      return;
    }
    setMealTitle(createMealTitle(items) ?? '');
  }, [items, mealTitle]);

  useEffect(() => {
    if (processing !== 'recognizing') {
      setRecognitionElapsedSeconds(0);
      return;
    }
    setRecognitionElapsedSeconds(0);
    const timer = setInterval(() => {
      setRecognitionElapsedSeconds((current) => current + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [processing]);

  if (!loading && !profile) {
    return <Redirect href="/onboarding" />;
  }

  const chooseImage = async (source: 'camera' | 'library') => {
    if (busy) {
      return;
    }
    const remainingSlots = MAX_MEAL_PHOTOS - foodImages.length;
    if (remainingSlots <= 0) {
      showAlert('图片已达到上限', `一餐最多添加 ${MAX_MEAL_PHOTOS} 张图片。`);
      return;
    }
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        showAlert('需要相机权限', '请在系统设置中允许相机权限，或改用相册和手动录入。');
        return;
      }
    }

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 1,
          cameraType: ImagePicker.CameraType.back,
        })
        : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 1,
          allowsEditing: false,
          allowsMultipleSelection: true,
          orderedSelection: true,
          selectionLimit: remainingSlots,
        });
    if (result.canceled || result.assets.length === 0) {
      return;
    }

    setProcessing('preparing');
    try {
      const preparedImages: PreparedFoodImage[] = [];
      for (const asset of result.assets.slice(0, remainingSlots)) {
        preparedImages.push(await prepareFoodImage(asset.uri, asset.width, asset.height));
      }
      setFoodImages((current) => [...current, ...preparedImages]);
    } catch (error) {
      showAlert('添加图片失败', error instanceof Error ? error.message : String(error));
    } finally {
      setProcessing(null);
    }
  };

  const handleRemovePhoto = (index: number) => {
    if (busy) {
      return;
    }
    setFoodImages((current) => {
      const removed = current[index];
      if (removed) {
        void deleteStoredPhoto(removed.storedUri);
      }
      return current.filter((_, currentIndex) => currentIndex !== index);
    });
  };

  const appendRecognitionWarningsToNotes = (warnings: string[]) => {
    const message = warnings.map((warning) => warning.trim()).filter(Boolean).join('\n');
    if (!message) {
      return;
    }
    const noteBlock = `AI识别提示：\n${message}`;
    setNotes((current) => {
      if (current.includes(noteBlock)) {
        return current;
      }
      const currentText = current.trimEnd();
      return currentText ? `${currentText}\n\n${noteBlock}` : noteBlock;
    });
  };

  const recognizeCurrentImages = async () => {
    if (!providerConfig || !hasApiKey) {
      showAlert(
        '尚未配置 AI',
        '请先到设置中填写兼容接口，或直接使用本地食物库手动记录。',
        [
          { text: '手动记录', style: 'cancel' },
          { text: '去设置', onPress: () => router.push('/(tabs)/settings') },
        ],
      );
      return;
    }

    setProcessing('recognizing');
    try {
      const apiKey = await getApiKey();
      if (!apiKey) {
        throw new Error('安全存储中没有 API Key，请重新配置。');
      }
      const recognized = await recognizeFoodImages(
        providerConfig,
        apiKey,
        foodImages.map((image) => image.uploadDataUri),
      );
      const drafts: MealItemDraft[] = [];
      for (const food of recognized.foods) {
        const match = await findFoodMatch(db, food.name);
        drafts.push(createMealItemDraftFromRecognition(food, match ?? undefined));
      }
      setItems(drafts);
      setMealTitle(recognized.mealTitle ?? createMealTitle(drafts) ?? '');
      appendRecognitionWarningsToNotes(recognized.warnings);
      if (drafts.length === 0) {
        showAlert('没有识别到食物', '请换一张更清晰的照片，或使用手动录入。');
      }
    } catch (error) {
      const message =
        error instanceof AIProviderError || error instanceof Error
          ? error.message
          : String(error);
      showAlert('识别失败', `${message}\n你仍可使用本地食物库手动记录。`);
    } finally {
      setProcessing(null);
    }
  };

  const handleRecognizeImages = () => {
    if (busy) {
      return;
    }
    if (foodImages.length === 0) {
      showAlert('请先添加图片', '拍照或从相册添加图片后，再进行 AI 识别。');
      return;
    }
    showAlert(
      '开始 AI 识别？',
      'AI 会根据当前图片重新生成下面的食物记录，并覆盖已经填写好的食物数据。确定继续吗？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确定识别',
          style: 'destructive',
          onPress: () => {
            void recognizeCurrentImages();
          },
        },
      ],
    );
  };

  const resetDraft = () => {
    for (const image of foodImages) {
      void deleteStoredPhoto(image.storedUri);
    }
    setFoodImages([]);
    setItems([]);
    setMealTitle('');
    setNotes('');
    setCatalogSavingId(undefined);
    setEatenAt(new Date());
    setMealType(inferMealTypeFromDate());
  };

  const handleReset = () => {
    if (busy || saving) {
      return;
    }
    if (!hasDraftContent) {
      resetDraft();
      return;
    }
    showAlert('重置当前记录？', '会清空当前未保存的图片、食物、标题和备注。', [
      { text: '取消', style: 'cancel' },
      { text: '重置', style: 'destructive', onPress: resetDraft },
    ]);
  };

  const updateItem = (index: number, nextItem: MealItemDraft) => {
    setItems((current) => current.map((item, itemIndex) => (itemIndex === index ? nextItem : item)));
  };

  const addItemToCatalog = async (item: MealItemDraft) => {
    if (!item.name.trim()) {
      showAlert('请先填写食物名称');
      return;
    }
    setCatalogSavingId(item.id);
    try {
      const catalogFoodId = await saveCustomFood(db, createCustomFoodInputFromMealItem(item));
      setItems((current) =>
        current.map((currentItem) =>
          currentItem.id === item.id
            ? {
              ...currentItem,
              source: 'catalog',
              catalogFoodId,
              recognitionAlternatives: undefined,
            }
            : currentItem,
        ),
      );
      showAlert('已加入食物库', '已保存为自定义食物，可在食物库继续编辑分类、别名和来源。');
    } catch (error) {
      showAlert('加入失败', error instanceof Error ? error.message : String(error));
    } finally {
      setCatalogSavingId(undefined);
    }
  };

  const handleSave = async () => {
    if (items.length === 0) {
      showAlert('还没有食物', '请先识别照片或手动添加至少一种食物。');
      return;
    }
    if (items.some((item) => !item.name.trim())) {
      showAlert('请填写食物名称');
      return;
    }
    setSaving(true);
    try {
      await saveMeal(db, {
        eatenAt: eatenAt.toISOString(),
        mealType,
        title: resolveMealTitle(mealTitle, items),
        photoUris: foodImages.map((image) => image.storedUri),
        notes: notes.trim() || undefined,
        items,
      });
      await syncTodayNutritionWidget(db);
      setItems([]);
      setMealTitle('');
      setFoodImages([]);
      setNotes('');
      setCatalogSavingId(undefined);
      setEatenAt(new Date());
      showAlert('已保存', '本餐记录已写入本机。', [
        { text: '查看今日', onPress: () => router.replace('/(tabs)') },
      ]);
    } catch (error) {
      showAlert('保存失败', error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const totals = sumMacros(items);
  const displayPhotos: PhotoGalleryItem[] = foodImages.flatMap((image) => {
    const uri = resolveStoredPhotoUri(image.storedUri);
    return uri ? [{ uri, width: image.width, height: image.height }] : [];
  });

  const fixedHeader = (
    <View style={styles.fixedHeader}>
      <View style={styles.header}>
        <View style={styles.headerTitleGroup}>
          <View style={styles.titleIcon}>
            <Ionicons name="scan" size={22} color={theme.colors.primary} />
          </View>
          <Text style={styles.title}>记录一餐</Text>
        </View>
        <View style={styles.headerActions}>
          <HeaderIconButton
            accessibilityLabel="重置当前记录"
            icon="refresh-outline"
            onPress={handleReset}
            disabled={busy || saving}
          />
          <HeaderIconButton
            accessibilityLabel="保存当前记录"
            icon="checkmark"
            onPress={handleSave}
            loading={saving}
            disabled={busy}
            variant="primary"
          />
        </View>
      </View>
    </View>
  );

  return (
    <>
      <Screen
        fixedHeader={fixedHeader}
        stickyHeaderKeys={items.length > 0 ? ['meal-total-summary'] : undefined}
      >

        <ChoiceChips
          value={mealType}
          onChange={setMealType}
          adaptive
          columns={4}
          options={[
            { label: '早餐', value: 'breakfast', icon: 'sunny-outline' },
            { label: '午餐', value: 'lunch', icon: 'restaurant-outline' },
            { label: '晚餐', value: 'dinner', icon: 'moon-outline' },
            { label: '加餐', value: 'snack', icon: 'cafe-outline' },
          ]}
        />

        <Card variant="base" style={styles.timeCard}>
          <MealDateTimePicker value={eatenAt} onChange={setEatenAt} />
        </Card>

        <View style={styles.photoActions}>
          <PhotoButton
            icon="camera"
            label="拍照"
            onPress={() => chooseImage('camera')}
            disabled={busy}
            primary
          />
          <PhotoButton
            icon="image-outline"
            label="相册"
            onPress={() => chooseImage('library')}
            disabled={busy}
          />
        </View>

        {processing === 'preparing' ? (
          <Card variant="prominent" style={styles.processing}>
            <View style={styles.processingIcon}>
              <Ionicons
                name="image-outline"
                size={24}
                color="#FFFFFF"
              />
            </View>
            <Text style={styles.processingTitle}>正在处理图片</Text>
          </Card>
        ) : null}

        <PhotoGallery photos={displayPhotos} onRemovePhoto={handleRemovePhoto} />

        <AIRecognizeButton
          onPress={handleRecognizeImages}
          loading={processing === 'recognizing'}
          disabled={busy || foodImages.length === 0}
          photoCount={foodImages.length}
        />

        {items.length > 0 ? (
          <View style={styles.mealTitleWrap}>
            <Ionicons name="sparkles-outline" size={19} color={theme.colors.primary} />
            <TextInput
              value={mealTitle}
              onChangeText={setMealTitle}
              placeholder="AI 会总结这一餐"
              placeholderTextColor={theme.colors.textFaint}
              style={styles.mealTitleInput}
            />
          </View>
        ) : null}

        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>食物</Text>
            <Text style={styles.itemCount}>{items.length}</Text>
          </View>
          <Pressable
            accessibilityLabel="添加食物"
            accessibilityRole="button"
            onPress={() => router.push('/select-food')}
            style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
          >
            <Ionicons name="add" size={20} color={theme.colors.primary} />
          </Pressable>
        </View>

        {items.length > 0 ? (
          <View key="meal-total-summary" style={styles.stickyTotalWrap}>
            <MealTotalSummary totals={totals} />
          </View>
        ) : null}

        {items.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="scan-outline" size={27} color={theme.colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>拍照或添加食物</Text>
          </View>
        ) : (
          items.map((item, index) => (
            <MealItemEditor
              key={item.id}
              item={item}
              onChange={(nextItem) => updateItem(index, nextItem)}
              onAddToCatalog={addItemToCatalog}
              addingToCatalog={catalogSavingId === item.id}
              onRemove={() =>
                setItems((current) => current.filter((currentItem) => currentItem.id !== item.id))
              }
            />
          ))
        )}

        <View style={styles.notesWrap}>
          <Ionicons name="create-outline" size={19} color={theme.colors.textMuted} />
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="添加备注（可选）"
            placeholderTextColor={theme.colors.textFaint}
            style={styles.notes}
          />
        </View>

        <Text style={styles.disclaimer}>营养数据为估算值，请按实际份量修正。</Text>
      </Screen>

      <AIRecognitionOverlay
        elapsedSeconds={recognitionElapsedSeconds}
        photoCount={foodImages.length}
        visible={processing === 'recognizing'}
      />
    </>
  );
}

function PhotoButton({
  icon,
  label,
  onPress,
  disabled,
  primary = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled: boolean;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.photoButton,
        primary && styles.photoButtonPrimary,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.photoIcon, primary && styles.photoIconPrimary]}>
        <Ionicons name={icon} size={34} color={primary ? '#FFFFFF' : theme.colors.primary} />
      </View>
      <Text style={[styles.photoButtonText, primary && styles.photoButtonTextPrimary]}>
        {label}
      </Text>
    </Pressable>
  );
}

function AIRecognizeButton({
  onPress,
  loading,
  disabled,
  photoCount,
}: {
  onPress: () => void;
  loading: boolean;
  disabled: boolean;
  photoCount: number;
}) {
  const muted = disabled && !loading;

  return (
    <Pressable
      accessibilityLabel="AI 识别当前图片"
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.aiRecognizeButton,
        muted && styles.aiRecognizeButtonDisabled,
        pressed && styles.aiRecognizeButtonPressed,
      ]}
    >
      <LinearGradient
        colors={
          muted
            ? ['#F7F9FE', '#F7F9FE']
            : [theme.colors.primary, '#6C4DFF', theme.colors.accent]
        }
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={styles.aiRecognizeGradient}
      >
        <View style={[styles.aiRecognizeIcon, muted && styles.aiRecognizeIconDisabled]}>
          <Ionicons
            name="sparkles"
            size={23}
            color={muted ? theme.colors.primary : '#FFFFFF'}
          />
        </View>
        <View style={styles.aiRecognizeTextWrap}>
          <Text
            style={[
              styles.aiRecognizeTitle,
              muted && styles.aiRecognizeTitleDisabled,
            ]}
          >
            AI 识别
          </Text>
          <Text
            style={[
              styles.aiRecognizeMeta,
              muted && styles.aiRecognizeMetaDisabled,
            ]}
          >
            {photoCount > 0 ? `当前 ${photoCount} 张图片` : '添加图片后可用'}
          </Text>
        </View>
        {loading ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <Ionicons
            name="chevron-forward"
            size={21}
            color={muted ? theme.colors.primary : '#FFFFFF'}
          />
        )}
      </LinearGradient>
    </Pressable>
  );
}

function AIRecognitionOverlay({
  visible,
  elapsedSeconds,
  photoCount,
}: {
  visible: boolean;
  elapsedSeconds: number;
  photoCount: number;
}) {
  const detail =
    elapsedSeconds >= 30
      ? '图片较复杂，正在继续等待结果。'
      : '通常需要 10-30 秒，复杂图片会更久。';

  return (
    <Modal
      animationType="fade"
      onRequestClose={() => undefined}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={styles.aiOverlayBackdrop}>
        <View
          accessibilityRole="progressbar"
          accessibilityValue={{ text: `AI 识别已用 ${elapsedSeconds} 秒` }}
          style={styles.aiOverlayCard}
        >
          <LinearGradient
            colors={[theme.colors.primary, '#6C4DFF', theme.colors.accent]}
            end={{ x: 1, y: 1 }}
            start={{ x: 0, y: 0 }}
            style={styles.aiOverlayIcon}
          >
            <Ionicons name="sparkles" size={28} color="#FFFFFF" />
          </LinearGradient>
          <Text style={styles.aiOverlayTitle}>正在 AI 识别</Text>
          <Text style={styles.aiOverlayBody}>
            正在分析 {photoCount} 张图片并估算食物份量。
          </Text>
          <View style={styles.aiOverlayTimer}>
            <ActivityIndicator color={theme.colors.primary} size="small" />
            <Text style={styles.aiOverlayTimerText}>已用 {elapsedSeconds} 秒</Text>
          </View>
          <Text style={styles.aiOverlayHint}>{detail}</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fixedHeader: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: theme.colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(209, 217, 230, 0.8)',
    boxShadow: '0 10px 24px rgba(16, 24, 40, 0.06)',
    zIndex: 5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 2,
    paddingBottom: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexShrink: 1,
  },
  titleIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: theme.colors.text,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.9,
  },
  photoActions: {
    flexDirection: 'row',
    gap: 10,
  },
  timeCard: {
    paddingVertical: 14,
  },
  photoButton: {
    flex: 1,
    minHeight: 132,
    borderRadius: 20,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.surface,
    padding: 16,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    boxShadow: theme.shadows.medium,
  },
  photoButtonPrimary: {
    flex: 1.35,
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
    boxShadow: theme.shadows.primary,
  },
  photoIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoIconPrimary: {
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  photoButtonText: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  photoButtonTextPrimary: {
    color: '#FFFFFF',
  },
  aiRecognizeButton: {
    borderRadius: 20,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: theme.colors.primary,
    overflow: 'hidden',
    boxShadow: theme.shadows.primary,
  },
  aiRecognizeButtonDisabled: {
    borderColor: '#D9E2FF',
    boxShadow: theme.shadows.small,
  },
  aiRecognizeButtonPressed: {
    transform: [{ translateY: 1 }],
    opacity: 0.92,
  },
  aiRecognizeGradient: {
    minHeight: 74,
    paddingHorizontal: 16,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  aiRecognizeIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(255,255,255,0.17)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiRecognizeIconDisabled: {
    backgroundColor: theme.colors.primarySoft,
  },
  aiRecognizeTextWrap: {
    flex: 1,
    gap: 2,
  },
  aiRecognizeTitle: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '900',
    letterSpacing: 0,
  },
  aiRecognizeTitleDisabled: {
    color: theme.colors.text,
  },
  aiRecognizeMeta: {
    color: 'rgba(255,255,255,0.76)',
    fontSize: 12,
    fontWeight: '800',
  },
  aiRecognizeMetaDisabled: {
    color: theme.colors.textMuted,
  },
  aiOverlayBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(8, 13, 26, 0.58)',
  },
  aiOverlayCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 28,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.82)',
    padding: 24,
    alignItems: 'center',
    boxShadow: '0 24px 60px rgba(16, 24, 40, 0.28)',
  },
  aiOverlayIcon: {
    width: 64,
    height: 64,
    borderRadius: 22,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  aiOverlayTitle: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0,
  },
  aiOverlayBody: {
    marginTop: 9,
    color: theme.colors.textMuted,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    textAlign: 'center',
  },
  aiOverlayTimer: {
    marginTop: 18,
    minHeight: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primarySoft,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  aiOverlayTimerText: {
    color: theme.colors.primary,
    fontSize: 15,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  aiOverlayHint: {
    marginTop: 13,
    color: theme.colors.textFaint,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.72,
  },
  processing: {
    flexDirection: 'row',
    alignItems: 'center',
    borderColor: '#FFFFFF',
    backgroundColor: theme.colors.surfaceTint,
  },
  processingIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: theme.colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  processingTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 5,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  itemCount: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceMuted,
    color: theme.colors.textMuted,
    textAlign: 'center',
    lineHeight: 24,
    fontSize: 11,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  addButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    minHeight: 104,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 17,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colors.borderStrong,
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceInset,
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 17,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  stickyTotalWrap: {
    backgroundColor: 'transparent',
    paddingVertical: 8,
    zIndex: 4,
  },
  notesWrap: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    borderRadius: 13,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.surfaceInset,
    paddingHorizontal: 14,
  },
  notes: {
    flex: 1,
    minHeight: 50,
    color: theme.colors.text,
    fontSize: 14,
  },
  mealTitleWrap: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderRadius: 15,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.surfaceRaised,
    paddingHorizontal: 14,
    boxShadow: theme.shadows.small,
  },
  mealTitleInput: {
    flex: 1,
    minHeight: 52,
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  disclaimer: {
    color: theme.colors.textFaint,
    fontSize: 11,
    textAlign: 'center',
  },
});
