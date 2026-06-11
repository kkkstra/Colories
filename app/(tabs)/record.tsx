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
import { FormField } from '@/components/ui/FormField';
import { MacroStrip } from '@/components/ui/MacroStrip';
import { Screen } from '@/components/ui/Screen';
import { theme } from '@/constants/Theme';
import { useApp } from '@/context/AppContext';
import { AIProviderError, recognizeFoodImage } from '@/lib/ai';
import { showAlert } from '@/lib/alert';
import {
  findFoodMatch,
  saveMeal,
  searchFoods,
  type CatalogSearchRow,
} from '@/lib/database';
import { prepareFoodImage } from '@/lib/image';
import { scaleNutrition, sumMacros } from '@/lib/nutrition';
import { createLocalId } from '@/lib/security';
import { getApiKey } from '@/lib/secureStorage';
import type { MealItemDraft, MealType } from '@/types/domain';

export default function RecordScreen() {
  const db = useSQLiteContext();
  const { loading, profile, providerConfig, hasApiKey } = useApp();
  const [mealType, setMealType] = useState<MealType>('lunch');
  const [items, setItems] = useState<MealItemDraft[]>([]);
  const [photoUri, setPhotoUri] = useState<string>();
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CatalogSearchRow[]>([]);

  useEffect(() => {
    if (!searching) {
      return;
    }
    const timer = setTimeout(() => {
      searchFoods(db, query, 16).then(setResults).catch(() => setResults([]));
    }, 180);
    return () => clearTimeout(timer);
  }, [db, query, searching]);

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
          drafts.push({
            id: createLocalId('food'),
            name: match.nameZh,
            weightGrams: food.estimatedWeightGrams,
            ...scaleNutrition(match, food.estimatedWeightGrams),
            source: 'catalog',
            catalogFoodId: match.id,
            confidence: food.confidence,
            cookingMethod: food.cookingMethod,
            warning: food.warning,
          });
        } else {
          drafts.push({
            id: createLocalId('food'),
            name: food.name,
            weightGrams: food.estimatedWeightGrams,
            ...food.nutrition,
            source: 'ai',
            confidence: food.confidence,
            cookingMethod: food.cookingMethod,
            warning: food.warning,
          });
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

  const addCatalogFood = (food: CatalogSearchRow) => {
    setItems((current) => [
      ...current,
      {
        id: createLocalId('food'),
        name: food.nameZh,
        weightGrams: 100,
        ...scaleNutrition(food, 100),
        source: 'catalog',
        catalogFoodId: food.id,
      },
    ]);
    setSearching(false);
    setQuery('');
  };

  const addCustomFood = () => {
    setItems((current) => [
      ...current,
      {
        id: createLocalId('food'),
        name: query.trim() || '自定义食物',
        weightGrams: 100,
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        source: 'manual',
      },
    ]);
    setSearching(false);
    setQuery('');
  };

  const updateItem = (index: number, nextItem: MealItemDraft) => {
    setItems((current) => current.map((item, itemIndex) => (itemIndex === index ? nextItem : item)));
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

      {photoUri ? <Image source={{ uri: photoUri }} style={styles.photo} /> : null}

      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>食物</Text>
          <Text style={styles.itemCount}>{items.length}</Text>
        </View>
        <Pressable
          accessibilityLabel={searching ? '关闭食物搜索' : '手动添加食物'}
          accessibilityRole="button"
          onPress={() => setSearching((value) => !value)}
          style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
        >
          <Ionicons name={searching ? 'close' : 'add'} size={20} color={theme.colors.primary} />
        </Pressable>
      </View>

      {searching ? (
        <Card>
          <FormField
            label="搜索食物"
            value={query}
            onChangeText={setQuery}
            placeholder="鸡胸肉、米饭、酸奶…"
            autoFocus
          />
          <View style={styles.searchResults}>
            {results.map((food) => (
              <Pressable
                key={food.id}
                onPress={() => addCatalogFood(food)}
                style={styles.searchRow}
              >
                <View style={styles.flex}>
                  <Text style={styles.searchName}>{food.nameZh}</Text>
                  <Text style={styles.muted}>
                    100g · {Math.round(food.calories)} kcal
                  </Text>
                </View>
                <Ionicons name="add" size={22} color={theme.colors.primary} />
              </Pressable>
            ))}
          </View>
          <AppButton
            label={query.trim() ? `创建“${query.trim()}”` : '创建自定义食物'}
            variant="secondary"
            onPress={addCustomFood}
          />
        </Card>
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
  searchResults: {
    maxHeight: 330,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  flex: {
    flex: 1,
  },
  searchName: {
    color: theme.colors.text,
    fontWeight: '800',
  },
  muted: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
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
