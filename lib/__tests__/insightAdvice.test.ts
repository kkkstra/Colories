import { describe, expect, it } from 'vitest';

import { buildInsightAdviceData, buildInsightAdviceDataHash } from '@/lib/insightAdvice';

describe('insight advice data hash', () => {
  const targets = { calories: 1800, protein: 110, carbs: 190, fat: 55 };
  const days = [
    { dateKey: '2026-06-11', calories: 1710, protein: 92, carbs: 210, fat: 48 },
    { dateKey: '2026-06-10', calories: 1602, protein: 88, carbs: 180, fat: 52 },
  ];

  it('stays stable for the same summaries and targets', () => {
    expect(buildInsightAdviceDataHash(days, targets)).toBe(
      buildInsightAdviceDataHash([...days], { ...targets }),
    );
  });

  it('changes when nutrition data changes', () => {
    expect(buildInsightAdviceDataHash(days, targets)).not.toBe(
      buildInsightAdviceDataHash(
        [{ ...days[0], calories: 1800 }, days[1]],
        targets,
      ),
    );
  });

  it('excludes empty days from advice nutrition data while tracking missing days', () => {
    const withEmptyDay = [
      days[0],
      { dateKey: '2026-06-10', calories: 0, protein: 0, carbs: 0, fat: 0 },
      days[1],
    ];
    const adviceData = buildInsightAdviceData(withEmptyDay);

    expect(adviceData.recordedDays).toEqual(days);
    expect(adviceData.missingDays).toBe(1);
  });

  it('does not change the hash when only an empty day date changes', () => {
    const emptyDayA = { dateKey: '2026-06-09', calories: 0, protein: 0, carbs: 0, fat: 0 };
    const emptyDayB = { dateKey: '2026-06-08', calories: 0, protein: 0, carbs: 0, fat: 0 };

    expect(buildInsightAdviceDataHash([...days, emptyDayA], targets)).toBe(
      buildInsightAdviceDataHash([...days, emptyDayB], targets),
    );
  });
});
