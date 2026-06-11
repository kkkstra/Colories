import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { MealItemEditor } from '@/components/MealItemEditor';
import { AppButton } from '@/components/ui/AppButton';
import { Card } from '@/components/ui/Card';
import { ChoiceChips } from '@/components/ui/ChoiceChips';
import { MacroStrip } from '@/components/ui/MacroStrip';
import { Screen } from '@/components/ui/Screen';
import { theme } from '@/constants/Theme';
import { useApp } from '@/context/AppContext';
import { AIProviderError, recognizeFoodImage } from '@/lib/ai';
import { showAlert } from '@/lib/alert';
import { findFoodMatch, saveCustomFood, saveMeal } from '@/lib/database';
import { prepareFoodImage, resolveStoredPhotoUri } from '@/lib/image';
import {
  createCustomFoodInputFromMealItem,
  createMealItemDraftFromRecognition,
} from '@/lib/mealItemDrafts';
import { inferMealTypeFromDate } from '@/lib/mealTiming';
import { sumMacros } from '@/lib/nutrition';
import { getApiKey } from '@/lib/secureStorage';
import { syncTodayNutritionWidget } from '@/lib/widgetSync';
import type { MealItemDraft, MealType } from '@/types/domain';

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
  const [items, setItems] = useState<MealItemDraft[]>([]);
  const [photoUri, setPhotoUri] = useState<string>();
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [catalogSavingId, setCatalogSavingId] = useState<string>();

  useEffect(() => {
    if (!queuedMealItem) {
      return;
    }
    setItems((current) => [...current, queuedMealItem]);
    clearQueuedMealItem();
  }, [clearQueuedMealItem, queuedMealItem]);

  if (!loading && !profile) {
    return <Redirect href="/onboarding" />;
  }

  const chooseImage = async (source: 'camera' | 'library') => {
    if (busy) {
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
          });
    if (result.canceled || !result.assets[0]) {
      return;
    }

    setBusy(true);
    try {
      const asset = result.assets[0];
      const prepared = await prepareFoodImage(asset.uri, asset.width, asset.height);
      setPhotoUri(prepared.thumbnailUri);
      if (!providerConfig || !hasApiKey) {
        showAlert(
          '尚未配置 AI',
          '照片已准备好。请先到设置中填写兼容接口，或直接使用本地食物库手动记录。',
          [
            { text: '手动记录', style: 'cancel' },
            { text: '去设置', onPress: () => router.push('/(tabs)/settings') },
          ],
        );
        return;
      }
      const apiKey = await getApiKey();
      if (!apiKey) {
        throw new Error('安全存储中没有 API Key，请重新配置。');
      }
      const recognized = await recognizeFoodImage(
        providerConfig,
        apiKey,
        prepared.uploadDataUri,
      );
      const drafts: MealItemDraft[] = [];
      for (const food of recognized.foods) {
        const match = await findFoodMatch(db, food.name);
        if (match) {
          drafts.push(createMealItemDraftFromRecognition(food, match));
        } else {
          drafts.push(createMealItemDraftFromRecognition(food));
        }
      }
      setItems(drafts);
      if (drafts.length === 0) {
        showAlert('没有识别到食物', '请换一张更清晰的照片，或使用手动录入。');
      } else if (recognized.warnings.length > 0) {
        showAlert('识别完成', recognized.warnings.join('\n'));
      }
    } catch (error) {
      const message =
        error instanceof AIProviderError || error instanceof Error
          ? error.message
          : String(error);
      showAlert('识别失败', `${message}\n你仍可使用本地食物库手动记录。`);
    } finally {
      setBusy(false);
    }
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
        eatenAt: new Date().toISOString(),
        mealType,
        photoUri,
        notes: notes.trim() || undefined,
        items,
      });
      await syncTodayNutritionWidget(db);
      setItems([]);
      setPhotoUri(undefined);
      setNotes('');
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
  const displayPhotoUri = resolveStoredPhotoUri(photoUri);

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.titleIcon}>
          <Ionicons name="scan" size={22} color={theme.colors.primary} />
        </View>
        <Text style={styles.title}>记录一餐</Text>
      </View>

      <ChoiceChips
        value={mealType}
        onChange={setMealType}
        options={[
          { label: '早餐', value: 'breakfast', icon: 'sunny-outline' },
          { label: '午餐', value: 'lunch', icon: 'restaurant-outline' },
          { label: '晚餐', value: 'dinner', icon: 'moon-outline' },
          { label: '加餐', value: 'snack', icon: 'cafe-outline' },
        ]}
      />

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

      {busy ? (
        <Card style={styles.processing}>
          <View style={styles.processingIcon}>
            <Ionicons name="scan-outline" size={24} color="#FFFFFF" />
          </View>
          <Text style={styles.processingTitle}>正在识别食物与份量</Text>
        </Card>
      ) : null}

      {displayPhotoUri ? <Image source={{ uri: displayPhotoUri }} style={styles.photo} /> : null}

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

      {items.length > 0 ? (
        <View style={styles.totalCard}>
          <View style={styles.totalVisual}>
            <Ionicons name="flash" size={18} color={theme.colors.accent} />
            <View style={styles.totalStrip}>
              <MacroStrip protein={totals.protein} carbs={totals.carbs} fat={totals.fat} />
            </View>
          </View>
          <View style={styles.totalRight}>
            <Text style={styles.totalCalories}>{Math.round(totals.calories)}</Text>
            <Text style={styles.totalUnit}>kcal</Text>
          </View>
        </View>
      ) : null}

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

      <AppButton
        label="保存"
        icon="checkmark"
        onPress={handleSave}
        loading={saving}
        disabled={busy}
      />
      <Text style={styles.disclaimer}>营养数据为估算值，请按实际份量修正。</Text>
    </Screen>
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

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 2,
    paddingBottom: 2,
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
  photoButton: {
    flex: 1,
    minHeight: 132,
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    padding: 16,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  photoButtonPrimary: {
    flex: 1.35,
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
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
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.72,
  },
  processing: {
    flexDirection: 'row',
    alignItems: 'center',
    borderColor: theme.colors.primary,
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
  photo: {
    width: '100%',
    height: 250,
    borderRadius: theme.radius.large,
    backgroundColor: theme.colors.surfaceMuted,
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
  totalCard: {
    backgroundColor: theme.colors.ink,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 18,
  },
  totalVisual: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  totalStrip: {
    flex: 1,
  },
  totalCalories: {
    color: '#FFFFFF',
    fontSize: 34,
    lineHeight: 36,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  totalRight: {
    alignItems: 'flex-end',
  },
  totalUnit: {
    color: '#AEB9CD',
    fontSize: 10,
    fontWeight: '800',
  },
  notesWrap: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 13,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 14,
  },
  notes: {
    flex: 1,
    minHeight: 50,
    color: theme.colors.text,
    fontSize: 14,
  },
  disclaimer: {
    color: theme.colors.textFaint,
    fontSize: 11,
    textAlign: 'center',
  },
});
