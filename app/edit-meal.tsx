import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { MealItemEditor } from '@/components/MealItemEditor';
import { AppButton } from '@/components/ui/AppButton';
import { HeaderIconButton } from '@/components/ui/AppHeader';
import { Card } from '@/components/ui/Card';
import { ChoiceChips } from '@/components/ui/ChoiceChips';
import { FormField } from '@/components/ui/FormField';
import { MealDateTimePicker } from '@/components/ui/MealDateTimePicker';
import { MealTotalSummary } from '@/components/ui/MealTotalSummary';
import { PhotoGallery, type PhotoGalleryItem } from '@/components/ui/PhotoGallery';
import { Screen } from '@/components/ui/Screen';
import { theme } from '@/constants/Theme';
import { createEditMealItemTarget, useApp } from '@/context/AppContext';
import { AIProviderError, recognizeFoodImages } from '@/lib/ai';
import { showAlert } from '@/lib/alert';
import { deleteMeal, findFoodMatch, getMealById, saveCustomFood, updateMeal } from '@/lib/database';
import {
  createFoodImageUploadDataUri,
  deleteStoredPhoto,
  prepareFoodImage,
  resolveStoredPhotoUri,
} from '@/lib/image';
import {
  createCustomFoodInputFromMealItem,
  createMealItemDraftFromRecognition,
} from '@/lib/mealItemDrafts';
import { createMealTitle, resolveMealTitle } from '@/lib/mealTitle';
import { sumMacros } from '@/lib/nutrition';
import { getApiKey } from '@/lib/secureStorage';
import { syncTodayNutritionWidget } from '@/lib/widgetSync';
import type { MealItemDraft, MealRecord, MealType } from '@/types/domain';

const MEAL_TYPE_OPTIONS: Array<{
  label: string;
  value: MealType;
  icon: 'sunny-outline' | 'restaurant-outline' | 'moon-outline' | 'cafe-outline';
}> = [
  { label: '早餐', value: 'breakfast', icon: 'sunny-outline' },
  { label: '午餐', value: 'lunch', icon: 'restaurant-outline' },
  { label: '晚餐', value: 'dinner', icon: 'moon-outline' },
  { label: '加餐', value: 'snack', icon: 'cafe-outline' },
];

const MAX_MEAL_PHOTOS = 6;
type ProcessingState = 'preparing' | 'recognizing' | null;

interface EditableFoodImage {
  storedUri: string;
  uploadDataUri?: string;
  width?: number;
  height?: number;
  isNew?: boolean;
}

export default function EditMealScreen() {
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    providerConfig,
    hasApiKey,
    queuedMealItem,
    clearQueuedMealItem,
  } = useApp();
  const mealId = Number(id);
  const queueTarget = Number.isFinite(mealId) ? createEditMealItemTarget(mealId) : '';
  const savedRef = useRef(false);
  const foodImagesRef = useRef<EditableFoodImage[]>([]);
  const [meal, setMeal] = useState<MealRecord | null>(null);
  const [items, setItems] = useState<MealItemDraft[]>([]);
  const [foodImages, setFoodImages] = useState<EditableFoodImage[]>([]);
  const [originalPhotoUris, setOriginalPhotoUris] = useState<string[]>([]);
  const [mealType, setMealType] = useState<MealType>('lunch');
  const [mealTitle, setMealTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [eatenAt, setEatenAt] = useState<Date | null>(null);
  const [processing, setProcessing] = useState<ProcessingState>(null);
  const [recognitionElapsedSeconds, setRecognitionElapsedSeconds] = useState(0);
  const [saving, setSaving] = useState(false);
  const [catalogSavingId, setCatalogSavingId] = useState<string>();
  const busy = processing !== null;

  useEffect(() => {
    if (!Number.isFinite(mealId)) {
      return;
    }
    getMealById(db, mealId).then((nextMeal) => {
      setMeal(nextMeal);
      setItems(nextMeal?.items ?? []);
      const nextPhotoUris = getMealPhotoUris(nextMeal);
      setFoodImages(nextPhotoUris.map((uri) => ({ storedUri: uri })));
      setOriginalPhotoUris(nextPhotoUris);
      setMealType(nextMeal?.mealType ?? 'lunch');
      setMealTitle(nextMeal?.title ?? createMealTitle(nextMeal?.items ?? []) ?? '');
      setNotes(nextMeal?.notes ?? '');
      if (nextMeal) {
        setEatenAt(new Date(nextMeal.eatenAt));
      }
    });
  }, [db, mealId]);

  useEffect(() => {
    if (!queuedMealItem || queuedMealItem.target !== queueTarget) {
      return;
    }
    setItems((current) => [...current, queuedMealItem.item]);
    clearQueuedMealItem();
  }, [clearQueuedMealItem, queueTarget, queuedMealItem]);

  useEffect(() => {
    foodImagesRef.current = foodImages;
  }, [foodImages]);

  useEffect(() => {
    return () => {
      if (savedRef.current) {
        return;
      }
      for (const image of foodImagesRef.current) {
        if (image.isNew) {
          void deleteStoredPhoto(image.storedUri);
        }
      }
    };
  }, []);

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

  if (!meal) {
    return (
      <Screen>
        <Text style={styles.loading}>正在读取记录…</Text>
      </Screen>
    );
  }

  const totals = sumMacros(items);
  const displayPhotos: PhotoGalleryItem[] = foodImages.flatMap((image) => {
    const uri = resolveStoredPhotoUri(image.storedUri);
    return uri ? [{ uri, width: image.width, height: image.height }] : [];
  });

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
      const preparedImages: EditableFoodImage[] = [];
      for (const asset of result.assets.slice(0, remainingSlots)) {
        preparedImages.push({
          ...(await prepareFoodImage(asset.uri, asset.width, asset.height)),
          isNew: true,
        });
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
      if (removed?.isNew) {
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

  const createUploadDataUris = async (): Promise<string[]> => {
    const nextImages = [...foodImages];
    const uploadDataUris: string[] = [];
    for (const [index, image] of nextImages.entries()) {
      if (image.uploadDataUri) {
        uploadDataUris.push(image.uploadDataUri);
        continue;
      }
      const photoUri = resolveStoredPhotoUri(image.storedUri);
      if (!photoUri) {
        continue;
      }
      const uploadDataUri = await createFoodImageUploadDataUri(
        photoUri,
        image.width ?? 0,
        image.height ?? 0,
      );
      nextImages[index] = { ...image, uploadDataUri };
      uploadDataUris.push(uploadDataUri);
    }
    setFoodImages(nextImages);
    return uploadDataUris;
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
      const uploadDataUris = await createUploadDataUris();
      if (uploadDataUris.length === 0) {
        throw new Error('没有可用于识别的图片，请重新添加照片。');
      }
      const recognized = await recognizeFoodImages(providerConfig, apiKey, uploadDataUris);
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
      '重新 AI 识别？',
      'AI 会根据当前图片重新生成下面的食物记录，并覆盖已经填写好的食物数据。确定继续吗？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '重新识别',
          style: 'destructive',
          onPress: () => {
            void recognizeCurrentImages();
          },
        },
      ],
    );
  };

  const handleSave = async () => {
    if (items.length === 0) {
      showAlert('至少保留一种食物，或删除整餐记录。');
      return;
    }
    if (items.some((item) => !item.name.trim())) {
      showAlert('请填写食物名称');
      return;
    }
    if (!eatenAt) {
      showAlert('请检查吃饭时间');
      return;
    }
    setSaving(true);
    try {
      const nextNotes = notes.trim() || undefined;
      await updateMeal(db, meal.id, {
        eatenAt: eatenAt.toISOString(),
        mealType,
        title: resolveMealTitle(mealTitle, items),
        notes: nextNotes,
        photoUris: foodImages.map((image) => image.storedUri),
        items,
      });
      const currentPhotoUris = new Set(foodImages.map((image) => image.storedUri));
      for (const photoUri of originalPhotoUris) {
        if (!currentPhotoUris.has(photoUri)) {
          void deleteStoredPhoto(photoUri);
        }
      }
      savedRef.current = true;
      await syncTodayNutritionWidget(db);
      router.back();
    } catch (error) {
      showAlert('保存失败', error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () => {
    showAlert('删除整餐记录？', '此操作无法撤销。', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteMeal(db, meal.id);
            const photoUrisToDelete = new Set([
              ...originalPhotoUris,
              ...foodImages.map((image) => image.storedUri),
            ]);
            for (const photoUri of photoUrisToDelete) {
              void deleteStoredPhoto(photoUri);
            }
            savedRef.current = true;
            await syncTodayNutritionWidget(db);
            router.back();
          } catch (error) {
            showAlert('删除失败', error instanceof Error ? error.message : String(error));
          }
        },
      },
    ]);
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

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={styles.headerActions}>
              <HeaderIconButton
                accessibilityLabel="删除整餐"
                icon="trash-outline"
                onPress={confirmDelete}
                disabled={busy || saving}
                variant="danger"
              />
              <HeaderIconButton
                accessibilityLabel="保存修改"
                icon="checkmark"
                loading={saving}
                onPress={handleSave}
                disabled={busy}
                variant="primary"
              />
            </View>
          ),
        }}
      />
      <Screen topSafe={false} stickyHeaderKeys={['meal-total-summary']}>
        <View style={styles.header}>
          <View style={styles.titleIcon}>
            <Text style={styles.titleIconText}>{items.length}</Text>
          </View>
          <Text style={styles.title}>编辑记录</Text>
        </View>
        <View key="meal-total-summary" style={styles.stickyTotalWrap}>
          <MealTotalSummary totals={totals} />
        </View>
        <Card variant="prominent" style={styles.metaCard}>
          <View style={styles.metaTitleRow}>
            <Text style={styles.metaTitle}>本餐信息</Text>
          </View>
          {eatenAt ? <MealDateTimePicker value={eatenAt} onChange={setEatenAt} /> : null}
          <FormField
            label="标题"
            value={mealTitle}
            onChangeText={setMealTitle}
            placeholder="例如：鸡腿饭配青菜"
            style={styles.titleInput}
          />
          <ChoiceChips
            value={mealType}
            onChange={setMealType}
            options={MEAL_TYPE_OPTIONS}
            adaptive
            columns={4}
          />
          <FormField
            label="备注"
            value={notes}
            onChangeText={setNotes}
            placeholder="口味、场景或份量修正…"
            multiline
            style={styles.notesInput}
          />
        </Card>
        <View style={styles.photoActions}>
          <AppButton
            label="拍照"
            icon="camera"
            onPress={() => chooseImage('camera')}
            disabled={busy}
            style={styles.photoAction}
          />
          <AppButton
            label="相册"
            icon="image-outline"
            onPress={() => chooseImage('library')}
            disabled={busy}
            variant="secondary"
            style={styles.photoAction}
          />
        </View>
        {processing === 'preparing' ? (
          <Card variant="prominent" style={styles.processing}>
            <ActivityIndicator color={theme.colors.primary} />
            <Text style={styles.processingTitle}>正在处理图片</Text>
          </Card>
        ) : null}
        <PhotoGallery photos={displayPhotos} onRemovePhoto={handleRemovePhoto} />
        <AppButton
          label={foodImages.length > 0 ? `重新 AI 识别（${foodImages.length}张）` : '重新 AI 识别'}
          icon="sparkles"
          onPress={handleRecognizeImages}
          loading={processing === 'recognizing'}
          disabled={busy || foodImages.length === 0}
        />
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>食物</Text>
            <Text style={styles.itemCount}>{items.length}</Text>
          </View>
          <Pressable
            accessibilityLabel="添加食物"
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: '/select-food',
                params: { queueTarget },
              })
            }
            style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
          >
            <Ionicons name="add" size={20} color={theme.colors.primary} />
          </Pressable>
        </View>
        {items.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="restaurant-outline" size={25} color={theme.colors.primary} />
            <Text style={styles.emptyTitle}>还没有食物</Text>
          </View>
        ) : (
          items.map((item, index) => (
            <MealItemEditor
              key={item.id}
              item={item}
              onChange={(next) =>
                setItems((current) =>
                  current.map((currentItem, currentIndex) =>
                    currentIndex === index ? next : currentItem,
                  ),
                )
              }
              onAddToCatalog={addItemToCatalog}
              addingToCatalog={catalogSavingId === item.id}
              onRemove={() =>
                setItems((current) => current.filter((currentItem) => currentItem.id !== item.id))
              }
            />
          ))
        )}
      </Screen>
      <AIRecognitionOverlay
        elapsedSeconds={recognitionElapsedSeconds}
        photoCount={foodImages.length}
        visible={processing === 'recognizing'}
      />
    </>
  );
}

function getMealPhotoUris(meal: MealRecord | null | undefined): string[] {
  if (!meal) {
    return [];
  }
  if (meal.photoUris?.length) {
    return meal.photoUris;
  }
  return meal.photoUri ? [meal.photoUri] : [];
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
          <View style={styles.aiOverlayIcon}>
            <Ionicons name="sparkles" size={28} color="#FFFFFF" />
          </View>
          <Text style={styles.aiOverlayTitle}>正在 AI 识别</Text>
          <Text style={styles.aiOverlayBody}>
            正在分析 {photoCount} 张图片并估算食物份量。
          </Text>
          <View style={styles.aiOverlayTimer}>
            <ActivityIndicator color={theme.colors.primary} size="small" />
            <Text style={styles.aiOverlayTimerText}>已用 {elapsedSeconds} 秒</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  titleIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.surfaceTint,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleIconText: {
    color: theme.colors.primary,
    fontSize: 15,
    fontWeight: '900',
  },
  title: {
    color: theme.colors.text,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 0,
  },
  loading: {
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginTop: 40,
  },
  metaCard: {
    gap: 13,
    borderColor: '#FFFFFF',
  },
  metaTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  notesInput: {
    minHeight: 78,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  titleInput: {
    fontWeight: '900',
  },
  stickyTotalWrap: {
    backgroundColor: 'transparent',
    paddingVertical: 8,
    zIndex: 4,
  },
  photoActions: {
    flexDirection: 'row',
    gap: 10,
  },
  photoAction: {
    flex: 1,
  },
  processing: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    borderColor: '#FFFFFF',
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
    gap: 8,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 21,
    fontWeight: '900',
  },
  itemCount: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: theme.colors.primarySoft,
    color: theme.colors.primary,
    textAlign: 'center',
    lineHeight: 28,
    fontSize: 13,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D9E2FF',
  },
  empty: {
    minHeight: 110,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: 18,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: theme.colors.surfaceRaised,
  },
  emptyTitle: {
    color: theme.colors.textMuted,
    fontSize: 14,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.72,
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
    backgroundColor: theme.colors.primary,
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
});
