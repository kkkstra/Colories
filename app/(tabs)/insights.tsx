import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { EnergyRail } from '@/components/ui/EnergyRail';
import { MacroStrip } from '@/components/ui/MacroStrip';
import { Screen } from '@/components/ui/Screen';
import { theme } from '@/constants/Theme';
import { useApp } from '@/context/AppContext';
import { generateNutritionInsightAdvice } from '@/lib/ai';
import { formatChineseDate, recentDateKeys } from '@/lib/date';
import {
  getCachedInsightAdvice,
  getDayTotals,
  saveCachedInsightAdvice,
  type CachedInsightAdvice,
  type DaySummary,
} from '@/lib/database';
import {
  buildInsightAdviceData,
  buildInsightAdviceDataHash,
  INSIGHT_ADVICE_CACHE_ID,
} from '@/lib/insightAdvice';
import { getApiKey } from '@/lib/secureStorage';

export default function InsightsScreen() {
  const db = useSQLiteContext();
  const { loading, profile, targets, providerConfig, hasApiKey } = useApp();
  const dates = useMemo(() => recentDateKeys(7), []);
  const [summaries, setSummaries] = useState<DaySummary[]>([]);
  const [refreshing, setRefreshing] = useState(true);
  const [advice, setAdvice] = useState<CachedInsightAdvice | null>(null);
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [adviceMessage, setAdviceMessage] = useState<string | null>(null);

  const loadAdvice = useCallback(
    async (nextSummaries: DaySummary[]) => {
      if (!targets) {
        setAdvice(null);
        setAdviceLoading(false);
        setAdviceMessage('设置目标后生成建议。');
        return;
      }
      const adviceData = buildInsightAdviceData(nextSummaries);
      if (adviceData.recordedDays.length === 0) {
        setAdvice(null);
        setAdviceLoading(false);
        setAdviceMessage('开始记录饮食后，这里会根据最近 7 天给建议。');
        return;
      }

      const dataHash = buildInsightAdviceDataHash(nextSummaries, targets);
      const cached = await getCachedInsightAdvice(db, INSIGHT_ADVICE_CACHE_ID);
      if (cached?.dataHash === dataHash) {
        setAdvice(cached);
        setAdviceLoading(false);
        setAdviceMessage(null);
        return;
      }

      setAdvice(null);
      if (!providerConfig || !hasApiKey) {
        setAdviceLoading(false);
        setAdviceMessage('配置 AI 后，根据最近 7 天记录生成建议。');
        return;
      }

      const apiKey = await getApiKey();
      if (!apiKey) {
        setAdviceLoading(false);
        setAdviceMessage('配置 AI 后，根据最近 7 天记录生成建议。');
        return;
      }

      setAdviceLoading(true);
      setAdviceMessage(null);
      try {
        const nextAdvice = await generateNutritionInsightAdvice(providerConfig, apiKey, {
          targets,
          days: adviceData.recordedDays,
          periodDays: adviceData.periodDays,
          missingDays: adviceData.missingDays,
        });
        const savedAdvice = await saveCachedInsightAdvice(db, {
          id: INSIGHT_ADVICE_CACHE_ID,
          dataHash,
          ...nextAdvice,
        });
        setAdvice(savedAdvice);
        setAdviceMessage(null);
      } catch {
        setAdvice(cached);
        setAdviceMessage(
          cached ? '数据已变化，当前显示上次建议。' : 'AI 建议暂时没生成，稍后再试。',
        );
      } finally {
        setAdviceLoading(false);
      }
    },
    [db, hasApiKey, providerConfig, targets],
  );

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const nextSummaries = await Promise.all(dates.map((dateKey) => getDayTotals(db, dateKey)));
      setSummaries(nextSummaries);
      setRefreshing(false);
      await loadAdvice(nextSummaries);
    } catch {
      setRefreshing(false);
      setAdviceLoading(false);
    }
  }, [dates, db, loadAdvice]);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => setRefreshing(false));
    }, [load]),
  );

  if (!loading && !profile) {
    return <Redirect href="/onboarding" />;
  }

  if (loading || refreshing) {
    return (
      <Screen scroll={false} contentContainerStyle={styles.loading}>
        <ActivityIndicator color={theme.colors.primary} size="large" />
      </Screen>
    );
  }

  const calorieTarget = targets?.calories ?? 2000;
  const totalCalories = summaries.reduce((sum, day) => sum + day.calories, 0);
  const averageCalories = summaries.length > 0 ? Math.round(totalCalories / summaries.length) : 0;
  const latest = summaries[0] ?? {
    dateKey: dates[0],
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  };
  const maxCalories = Math.max(calorieTarget, ...summaries.map((day) => day.calories), 1);
  const activeDays = summaries.filter((day) => day.calories > 0).length;

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>洞察</Text>
          <Text style={styles.subtitle}>最近 7 天</Text>
        </View>
        <View style={styles.headerIcon}>
          <Ionicons name="analytics" size={22} color={theme.colors.primary} />
        </View>
      </View>

      <Card variant="prominent" style={styles.hero}>
        <View style={styles.heroTop}>
          <View>
            <Text style={styles.heroLabel}>日均摄入</Text>
            <View style={styles.calorieRow}>
              <Text style={styles.calorieValue}>{averageCalories}</Text>
              <Text style={styles.calorieUnit}>kcal</Text>
            </View>
          </View>
          <View style={styles.activeDays}>
            <Text style={styles.activeDaysValue}>{activeDays}</Text>
            <Text style={styles.activeDaysLabel}>天有记录</Text>
          </View>
        </View>
        <EnergyRail value={averageCalories} target={calorieTarget} />
      </Card>

      <Card variant="base" style={styles.adviceCard}>
        <View style={styles.adviceHeader}>
          <View style={styles.adviceHeading}>
            <View style={styles.adviceIcon}>
              <Ionicons name="sparkles-outline" size={17} color={theme.colors.primary} />
            </View>
            <Text style={styles.adviceLabel}>AI 建议</Text>
          </View>
          <Text style={styles.adviceRefreshLabel}>数据变化时更新</Text>
        </View>

        {adviceLoading ? (
          <View style={styles.adviceLoading}>
            <ActivityIndicator color={theme.colors.primary} size="small" />
            <Text style={styles.adviceMuted}>正在根据最近 7 天生成建议</Text>
          </View>
        ) : advice ? (
          <View style={styles.adviceBody}>
            <Text style={styles.adviceTitle}>{advice.title}</Text>
            <Text style={styles.adviceSummary}>{advice.summary}</Text>
            <View style={styles.adviceActions}>
              {advice.actions.map((action) => (
                <View key={action} style={styles.adviceAction}>
                  <Ionicons name="checkmark-circle" size={16} color={theme.colors.success} />
                  <Text style={styles.adviceActionText}>{action}</Text>
                </View>
              ))}
            </View>
            {advice.warnings.map((warning) => (
              <View key={warning} style={styles.adviceWarning}>
                <Ionicons name="alert-circle" size={15} color={theme.colors.warning} />
                <Text style={styles.adviceWarningText}>{warning}</Text>
              </View>
            ))}
            {adviceMessage ? <Text style={styles.adviceMuted}>{adviceMessage}</Text> : null}
          </View>
        ) : (
          <Text style={styles.adviceMuted}>
            {adviceMessage ?? '有新的饮食记录后，这里会给出更具体的建议。'}
          </Text>
        )}
      </Card>

      <View style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <Text style={styles.sectionTitle}>热量走势</Text>
          <Text style={styles.targetText}>目标 {Math.round(calorieTarget)}</Text>
        </View>
        <View style={styles.chart}>
          {[...summaries].reverse().map((day) => {
            const barHeight = Math.max(8, (day.calories / maxCalories) * 116);
            const overTarget = day.calories > calorieTarget;
            return (
              <View key={day.dateKey} style={styles.barSlot}>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        height: barHeight,
                        backgroundColor: overTarget ? theme.colors.accent : theme.colors.primary,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.barLabel}>
                  {new Date(`${day.dateKey}T12:00:00`).getDate()}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      <Card variant="base" style={styles.todayCard}>
        <View style={styles.todayTop}>
          <View>
            <Text style={styles.todayMeta}>{formatChineseDate(latest.dateKey)}</Text>
            <Text style={styles.todayTitle}>今日宏量营养</Text>
          </View>
          <Text style={styles.todayCalories}>{Math.round(latest.calories)}</Text>
        </View>
        <MacroStrip protein={latest.protein} carbs={latest.carbs} fat={latest.fat} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: {
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  title: {
    color: theme.colors.text,
    fontSize: 32,
    fontWeight: '900',
  },
  subtitle: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: '800',
    paddingTop: 2,
  },
  headerIcon: {
    width: 46,
    height: 46,
    borderRadius: 17,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: theme.shadows.small,
  },
  hero: {
    gap: 14,
    borderColor: '#FFFFFF',
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  heroLabel: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: '800',
  },
  calorieRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    paddingTop: 2,
  },
  calorieValue: {
    color: theme.colors.text,
    fontSize: 42,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  calorieUnit: {
    color: theme.colors.textMuted,
    fontSize: 14,
    fontWeight: '900',
    paddingBottom: 8,
  },
  activeDays: {
    minWidth: 86,
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.surfaceTint,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    alignItems: 'center',
    paddingVertical: 10,
  },
  activeDaysValue: {
    color: theme.colors.primary,
    fontSize: 22,
    fontWeight: '900',
  },
  activeDaysLabel: {
    color: theme.colors.primary,
    fontSize: 11,
    fontWeight: '900',
  },
  adviceCard: {
    gap: 12,
  },
  adviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  adviceHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  adviceIcon: {
    width: 30,
    height: 30,
    borderRadius: 11,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.primaryWash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adviceLabel: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  adviceRefreshLabel: {
    color: theme.colors.textFaint,
    fontSize: 11,
    fontWeight: '800',
    flexShrink: 0,
  },
  adviceBody: {
    gap: 9,
  },
  adviceTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  adviceSummary: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
  },
  adviceActions: {
    gap: 8,
    paddingTop: 2,
  },
  adviceAction: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  adviceActionText: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
  },
  adviceWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.warningSoft,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  adviceWarningText: {
    color: theme.colors.warning,
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 18,
  },
  adviceLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 38,
  },
  adviceMuted: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
  },
  chartCard: {
    borderRadius: theme.radius.large,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.surfaceRaised,
    borderWidth: 1,
    borderColor: '#FFFFFF',
    padding: 16,
    gap: 16,
    boxShadow: theme.shadows.medium,
  },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  targetText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  chart: {
    height: 142,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  barSlot: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  barTrack: {
    width: '100%',
    height: 116,
    borderRadius: 16,
    backgroundColor: theme.colors.surfaceInset,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
  },
  barFill: {
    width: '100%',
    borderRadius: 16,
  },
  barLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
  },
  todayCard: {
    gap: 14,
  },
  todayTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  todayMeta: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  todayTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  todayCalories: {
    color: theme.colors.text,
    fontSize: 30,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
});
