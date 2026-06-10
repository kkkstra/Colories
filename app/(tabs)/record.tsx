import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { Card } from '@/components/ui/Card';
import { ChoiceChips } from '@/components/ui/ChoiceChips';
import { FormField } from '@/components/ui/FormField';
import { Screen } from '@/components/ui/Screen';
import { MealItemEditor } from '@/components/MealItemEditor';
import { theme } from '@/constants/Theme';
import { useApp } from '@/context/AppContext';
import { AIProviderError, recognizeFoodImage } from '@/lib/ai';
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
        Alert.alert('需要相机权限', '请在系统设置中允许相机权限，或改用相册和手动录入。');
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
        Alert.alert(
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
        Alert.alert('没有识别到食物', '请换一张更清晰的照片，或使用手动录入。');
      } else if (recognized.warnings.length > 0) {
        Alert.alert('识别完成', recognized.warnings.join('\n'));
      }
    } catch (error) {
      const message =
        error instanceof AIProviderError || error instanceof Error
          ? error.message
          : String(error);
      Alert.alert('识别失败', `${message}\n你仍可使用本地食物库手动记录。`);
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
      Alert.alert('还没有食物', '请先识别照片或手动添加至少一种食物。');
      return;
    }
    if (items.some((item) => !item.name.trim())) {
      Alert.alert('请填写食物名称');
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
      Alert.alert('已保存', '本餐记录已写入本机。', [
        { text: '查看今日', onPress: () => router.replace('/(tabs)') },
      ]);
    } catch (error) {
      Alert.alert('保存失败', error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const totals = sumMacros(items);

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.kicker}>ADD / MEAL</Text>
        <Text style={styles.title}>把这一餐记准</Text>
        <Text style={styles.subtitle}>先拍照识别，再逐项确认食物和份量。</Text>
      </View>

      <View style={styles.mealSelector}>
        <View style={styles.selectorHeader}>
          <Text style={styles.selectorIndex}>01</Text>
          <Text style={styles.selectorLabel}>选择餐次</Text>
        </View>
        <ChoiceChips
          value={mealType}
          onChange={setMealType}
          options={[
            { label: '早餐', value: 'breakfast' },
            { label: '午餐', value: 'lunch' },
            { label: '晚餐', value: 'dinner' },
            { label: '加餐', value: 'snack' },
          ]}
        />
      </View>

      <View style={styles.photoActions}>
        <PhotoButton
          icon="camera"
          label="拍照识别"
          hint="现场拍下整套餐食"
          onPress={() => chooseImage('camera')}
          disabled={busy}
          primary
        />
        <PhotoButton
          icon="images-outline"
          label="选择照片"
          hint="使用已有的餐食图片"
          onPress={() => chooseImage('library')}
          disabled={busy}
        />
      </View>

      {busy ? (
        <Card style={styles.processing}>
          <View style={styles.processingIcon}>
            <Ionicons name="scan-outline" size={25} color="#FFFFFF" />
          </View>
          <View style={styles.processingCopy}>
            <Text style={styles.processingEyebrow}>VISION MODEL ACTIVE</Text>
            <Text style={styles.processingTitle}>正在分析食物与份量</Text>
            <Text style={styles.muted}>识别结果不会自动保存。</Text>
          </View>
        </Card>
      ) : null}

      {photoUri ? <Image source={{ uri: photoUri }} style={styles.photo} /> : null}

      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionIndex}>02 / REVIEW</Text>
          <Text style={styles.sectionTitle}>核对食物明细</Text>
        </View>
        <Pressable onPress={() => setSearching((value) => !value)} style={styles.addLink}>
          <Text style={styles.addLinkText}>手动添加</Text>
          <Ionicons name={searching ? 'close' : 'add'} size={18} color={theme.colors.primary} />
        </Pressable>
      </View>

      {searching ? (
        <Card>
          <FormField
            label="搜索本地食物库"
            value={query}
            onChangeText={setQuery}
            placeholder="例如：鸡胸肉、米饭、酸奶"
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
                    每100g · {Math.round(food.calories)} kcal · 蛋白质 {food.protein}g
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
          <Text style={styles.emptyNumber}>00</Text>
          <View style={styles.emptyCopy}>
            <Text style={styles.emptyTitle}>还没有待确认的食物</Text>
            <Text style={styles.muted}>拍照识别，或从本地营养库手动添加。</Text>
          </View>
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
          <View>
            <Text style={styles.totalLabel}>MEAL TOTAL</Text>
            <Text style={styles.totalMacros}>
              P {Math.round(totals.protein)}g · C {Math.round(totals.carbs)}g · F{' '}
              {Math.round(totals.fat)}g
            </Text>
          </View>
          <View style={styles.totalRight}>
            <Text style={styles.totalCalories}>{Math.round(totals.calories)}</Text>
            <Text style={styles.totalUnit}>KCAL</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.notesWrap}>
        <Text style={styles.notesLabel}>餐食备注 / 可选</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="例如：酱汁另放、鸡胸肉去皮"
          placeholderTextColor={theme.colors.textFaint}
          style={styles.notes}
          multiline
        />
      </View>

      <AppButton
        label="确认并保存本餐"
        icon="checkmark"
        onPress={handleSave}
        loading={saving}
        disabled={busy}
      />
      <Text style={styles.disclaimer}>
        拍照识别与营养数据均为估算。请根据实际食材、油量和份量进行修正。
      </Text>
    </Screen>
  );
}

function PhotoButton({
  icon,
  label,
  hint,
  onPress,
  disabled,
  primary = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint: string;
  onPress: () => void;
  disabled: boolean;
  primary?: boolean;
}) {
  return (
    <Pressable
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
        <Ionicons name={icon} size={26} color={primary ? '#FFFFFF' : theme.colors.primary} />
      </View>
      <View style={styles.photoButtonCopy}>
        <Text style={[styles.photoButtonText, primary && styles.photoButtonTextPrimary]}>
          {label}
        </Text>
        <Text style={[styles.photoButtonHint, primary && styles.photoButtonHintPrimary]}>
          {hint}
        </Text>
      </View>
      <Ionicons
        name="arrow-forward"
        size={18}
        color={primary ? '#FFFFFF' : theme.colors.textMuted}
      />
    </Pressable>
  );
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
  mealSelector: {
    gap: 12,
    paddingVertical: 4,
  },
  selectorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  selectorIndex: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },
  selectorLabel: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  sectionIndex: {
    color: theme.colors.primary,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
    marginBottom: 3,
  },
  photoActions: {
    gap: 10,
  },
  photoButton: {
    minHeight: 86,
    borderRadius: theme.radius.medium,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
  },
  photoButtonPrimary: {
    minHeight: 108,
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  photoIcon: {
    width: 48,
    height: 48,
    borderRadius: 13,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoIconPrimary: {
    width: 58,
    height: 58,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  photoButtonCopy: {
    flex: 1,
  },
  photoButtonText: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  photoButtonTextPrimary: {
    color: '#FFFFFF',
    fontSize: 20,
  },
  photoButtonHint: {
    color: theme.colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  photoButtonHintPrimary: {
    color: '#DCE4FF',
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.8,
  },
  processing: {
    flexDirection: 'row',
    alignItems: 'center',
    borderColor: theme.colors.primary,
  },
  processingIcon: {
    width: 48,
    height: 48,
    borderRadius: 13,
    backgroundColor: theme.colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  processingCopy: {
    flex: 1,
  },
  processingEyebrow: {
    color: theme.colors.primary,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },
  processingTitle: {
    color: theme.colors.text,
    fontWeight: '900',
    marginTop: 2,
  },
  photo: {
    width: '100%',
    height: 260,
    borderRadius: theme.radius.large,
    backgroundColor: theme.colors.surfaceMuted,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 8,
  },
  addLinkText: {
    color: theme.colors.primary,
    fontSize: 13,
    fontWeight: '800',
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
    fontWeight: '700',
  },
  muted: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  empty: {
    minHeight: 112,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 18,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colors.borderStrong,
    borderRadius: theme.radius.medium,
  },
  emptyNumber: {
    color: theme.colors.borderStrong,
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: -2,
  },
  emptyCopy: {
    flex: 1,
    gap: 4,
  },
  emptyTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  totalCard: {
    backgroundColor: theme.colors.ink,
    borderRadius: theme.radius.medium,
    paddingHorizontal: 18,
    paddingVertical: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  totalLabel: {
    color: '#AEB9CD',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  totalCalories: {
    color: '#FFFFFF',
    fontSize: 34,
    lineHeight: 36,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  totalMacros: {
    color: '#D0D5DD',
    fontSize: 12,
    marginTop: 6,
  },
  totalRight: {
    alignItems: 'flex-end',
  },
  totalUnit: {
    color: theme.colors.accent,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  notesWrap: {
    gap: 7,
  },
  notesLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  notes: {
    minHeight: 76,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.small,
    backgroundColor: theme.colors.surface,
    padding: 14,
    color: theme.colors.text,
    textAlignVertical: 'top',
  },
  disclaimer: {
    color: theme.colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 17,
  },
});
