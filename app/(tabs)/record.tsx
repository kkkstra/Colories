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
      <View>
        <Text style={styles.kicker}>拍照或手动录入</Text>
        <Text style={styles.title}>记录这一餐</Text>
      </View>

      <Card>
        <Text style={styles.sectionTitle}>餐次</Text>
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
      </Card>

      <View style={styles.photoActions}>
        <PhotoButton
          icon="camera-outline"
          label="拍照识别"
          onPress={() => chooseImage('camera')}
          disabled={busy}
        />
        <PhotoButton
          icon="images-outline"
          label="从相册选择"
          onPress={() => chooseImage('library')}
          disabled={busy}
        />
      </View>

      {busy ? (
        <Card style={styles.processing}>
          <Ionicons name="sparkles-outline" size={25} color={theme.colors.accent} />
          <View style={styles.processingCopy}>
            <Text style={styles.processingTitle}>正在分析食物与份量</Text>
            <Text style={styles.muted}>通常需要几秒，请保持网络连接。</Text>
          </View>
        </Card>
      ) : null}

      {photoUri ? <Image source={{ uri: photoUri }} style={styles.photo} /> : null}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>食物明细</Text>
        <Pressable onPress={() => setSearching((value) => !value)} style={styles.addLink}>
          <Ionicons name="add-circle" size={20} color={theme.colors.primary} />
          <Text style={styles.addLinkText}>手动添加</Text>
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
        <Card style={styles.empty}>
          <Text style={styles.emptyTitle}>等待添加食物</Text>
          <Text style={styles.muted}>AI 结果不会自动保存，你可以逐项确认和修改。</Text>
        </Card>
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
        <Card style={styles.totalCard}>
          <Text style={styles.totalLabel}>本餐合计</Text>
          <Text style={styles.totalCalories}>{Math.round(totals.calories)} kcal</Text>
          <Text style={styles.totalMacros}>
            蛋白质 {Math.round(totals.protein)}g · 碳水 {Math.round(totals.carbs)}g · 脂肪{' '}
            {Math.round(totals.fat)}g
          </Text>
        </Card>
      ) : null}

      <TextInput
        value={notes}
        onChangeText={setNotes}
        placeholder="备注（可选）"
        placeholderTextColor={theme.colors.textMuted}
        style={styles.notes}
        multiline
      />

      <AppButton label="确认并保存" onPress={handleSave} loading={saving} disabled={busy} />
      <Text style={styles.disclaimer}>
        拍照识别与营养数据均为估算。请根据实际食材、油量和份量进行修正。
      </Text>
    </Screen>
  );
}

function PhotoButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.photoButton,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Ionicons name={icon} size={26} color={theme.colors.primary} />
      <Text style={styles.photoButtonText}>{label}</Text>
    </Pressable>
  );
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
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  photoActions: {
    flexDirection: 'row',
    gap: 12,
  },
  photoButton: {
    flex: 1,
    minHeight: 92,
    borderRadius: theme.radius.medium,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#C7DDCA',
  },
  photoButtonText: {
    color: theme.colors.primary,
    fontWeight: '800',
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
  },
  processingCopy: {
    flex: 1,
  },
  processingTitle: {
    color: theme.colors.text,
    fontWeight: '800',
  },
  photo: {
    width: '100%',
    height: 220,
    borderRadius: theme.radius.medium,
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
    gap: 4,
  },
  addLinkText: {
    color: theme.colors.primary,
    fontWeight: '700',
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
    alignItems: 'center',
  },
  emptyTitle: {
    color: theme.colors.text,
    fontWeight: '800',
  },
  totalCard: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  totalLabel: {
    color: '#DDEBDD',
    fontWeight: '600',
  },
  totalCalories: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '900',
  },
  totalMacros: {
    color: '#DDEBDD',
  },
  notes: {
    minHeight: 70,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.small,
    backgroundColor: '#FFFFFF',
    padding: 12,
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
