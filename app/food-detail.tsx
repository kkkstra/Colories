import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { HeaderIconButton } from '@/components/ui/AppHeader';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { theme } from '@/constants/Theme';
import { FOOD_CATEGORY_LABELS } from '@/data/foodCategories';
import { getManagedFoodById, type ManagedFood } from '@/lib/database';

export default function FoodDetailScreen() {
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [food, setFood] = useState<ManagedFood | null>(null);
  const [loading, setLoading] = useState(Boolean(id));

  useEffect(() => {
    let active = true;
    if (!id) {
      setFood(null);
      setLoading(false);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    getManagedFoodById(db, id)
      .then((nextFood) => {
        if (active) {
          setFood(nextFood);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [db, id]);

  const copyFood = () => {
    if (!food) {
      return;
    }
    router.push({ pathname: '/edit-food', params: { sourceId: food.id } });
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: food?.isCustom ? '我的食物' : '预置食物',
          headerRight: () =>
            food && !food.isCustom ? (
              <HeaderIconButton
                accessibilityLabel="复制为我的食物"
                icon="copy-outline"
                onPress={copyFood}
                variant="primary"
              />
            ) : null,
        }}
      />
      <Screen topSafe={false} contentContainerStyle={styles.screen}>
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={theme.colors.primary} size="large" />
          </View>
        ) : food ? (
          <>
            <Card variant="prominent" style={styles.heroCard}>
              <View style={styles.heroTop}>
                <View style={styles.heroIcon}>
                  <Ionicons name="restaurant-outline" size={25} color={theme.colors.primary} />
                </View>
                <View style={styles.heroCopy}>
                  <Text style={styles.name}>{food.nameZh}</Text>
                  {food.nameEn ? <Text style={styles.englishName}>{food.nameEn}</Text> : null}
                </View>
                <View style={[styles.badge, food.isCustom && styles.badgeCustom]}>
                  <Text style={[styles.badgeText, food.isCustom && styles.badgeTextCustom]}>
                    {food.isCustom ? '我的' : '预置'}
                  </Text>
                </View>
              </View>

              <View style={styles.calorieRow}>
                <View>
                  <Text style={styles.detailLabel}>每 100g/ml</Text>
                  <View style={styles.calorieValueRow}>
                    <Text style={styles.calorieValue}>{formatNumber(food.calories)}</Text>
                    <Text style={styles.calorieUnit}>kcal</Text>
                  </View>
                </View>
              </View>

              <View style={styles.macroGrid}>
                <MacroTile label="蛋白质" value={food.protein} color={theme.colors.protein} />
                <MacroTile label="碳水" value={food.carbs} color={theme.colors.carbs} />
                <MacroTile label="脂肪" value={food.fat} color={theme.colors.fat} />
              </View>
            </Card>

            <Card style={styles.infoCard}>
              <InfoRow label="分类" value={FOOD_CATEGORY_LABELS[food.category]} />
              <InfoRow label="烹饪方式" value={food.cookingMethod || '未标注'} />
              <InfoRow label="别名" value={food.aliases.length ? food.aliases.join('、') : '无'} />
              <View style={styles.sourceBlock}>
                <Text style={styles.infoLabel}>来源</Text>
                <Text selectable style={styles.sourceText}>
                  {food.sourceReference}
                </Text>
              </View>
            </Card>
          </>
        ) : (
          <Card style={styles.emptyCard}>
            <Ionicons name="search-outline" size={28} color={theme.colors.textMuted} />
            <Text style={styles.emptyTitle}>没有找到这个食物</Text>
            <Text style={styles.emptyText}>返回食物库后重新选择。</Text>
          </Card>
        )}
      </Screen>
    </>
  );
}

function MacroTile({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.macroTile}>
      <View style={[styles.macroDot, { backgroundColor: color }]} />
      <Text style={styles.macroLabel}>{label}</Text>
      <Text style={styles.macroValue}>{formatNumber(value)}g</Text>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text selectable style={styles.infoValue}>
        {value}
      </Text>
    </View>
  );
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: 14,
  },
  loading: {
    minHeight: 240,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCard: {
    gap: 18,
    borderColor: '#FFFFFF',
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heroIcon: {
    width: 50,
    height: 50,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.primaryWash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  name: {
    color: theme.colors.text,
    fontSize: 25,
    lineHeight: 30,
    fontWeight: '900',
  },
  englishName: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  badge: {
    borderRadius: 10,
    backgroundColor: theme.colors.primaryWash,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeCustom: {
    backgroundColor: theme.colors.successSoft,
  },
  badgeText: {
    color: theme.colors.primary,
    fontSize: 11,
    fontWeight: '900',
  },
  badgeTextCustom: {
    color: theme.colors.success,
  },
  calorieRow: {
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.ink,
    padding: 18,
  },
  detailLabel: {
    color: '#B9C1D0',
    fontSize: 12,
    fontWeight: '900',
  },
  calorieValueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginTop: 6,
  },
  calorieValue: {
    color: '#FFFFFF',
    fontSize: 48,
    lineHeight: 52,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  calorieUnit: {
    color: '#B9C1D0',
    fontSize: 13,
    fontWeight: '900',
    paddingBottom: 8,
  },
  macroGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  macroTile: {
    flex: 1,
    minWidth: 0,
    borderRadius: 14,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: theme.colors.surfaceInset,
    padding: 12,
    gap: 6,
  },
  macroDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  macroLabel: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: '900',
  },
  macroValue: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  infoCard: {
    gap: 0,
    paddingVertical: 4,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 18,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderSoft,
  },
  infoLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '900',
  },
  infoValue: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'right',
  },
  sourceBlock: {
    gap: 8,
    paddingVertical: 14,
  },
  sourceText: {
    color: theme.colors.text,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '700',
  },
  emptyCard: {
    minHeight: 190,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  emptyTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  emptyText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
});
