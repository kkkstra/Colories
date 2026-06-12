import { describe, expect, it, vi } from 'vitest';

import {
  AIProviderError,
  buildMealSuggestionRequestBody,
  buildInsightAdviceRequestBody,
  buildRequestBody,
  generateMealSuggestionAdvice,
  generateNutritionInsightAdvice,
  parseMealSuggestionContent,
  parseInsightAdviceContent,
  parseRecognitionContent,
  testProviderConfiguration,
} from '@/lib/ai';

const validContent = JSON.stringify({
  meal_title: '香煎鸡胸肉',
  foods: [
    {
      name: '鸡胸肉',
      estimated_weight_grams: 150,
      cooking_method: '香煎',
      confidence: 0.61,
      nutrition: { calories: 280, protein: 42, carbs: 2, fat: 11 },
    },
  ],
  warnings: ['份量为视觉估算'],
});

const validAdviceContent = JSON.stringify({
  title: '晚餐稳一点',
  summary: '最近 7 天热量波动较大，蛋白质接近目标但碳水集中在少数几天。',
  actions: ['把晚餐主食固定到一拳左右。', '每餐保留一个稳定蛋白质来源。'],
  warnings: ['有 2 天没有记录，趋势可能偏低。'],
});

const mealCandidates = [
  {
    id: 'chicken',
    name: '鸡胸肉',
    category: 'protein' as const,
    servingGrams: 120,
    calories: 198,
    protein: 37.2,
    carbs: 0,
    fat: 4.3,
  },
  {
    id: 'rice',
    name: '白米饭',
    category: 'staple' as const,
    servingGrams: 100,
    calories: 130,
    protein: 2.7,
    carbs: 28.2,
    fat: 0.3,
  },
  {
    id: 'broccoli',
    name: '西兰花',
    category: 'vegetable' as const,
    servingGrams: 200,
    calories: 70,
    protein: 4.8,
    carbs: 14.4,
    fat: 0.8,
  },
];

const validMealSuggestionContent = JSON.stringify({
  title: '清淡补蛋白',
  summary: '今天脂肪剩得不多，这餐适合用低脂蛋白配蔬菜和小份主食。',
  combo: [
    { food_id: 'chicken', name: '鸡胸肉', serving_grams: 120, reason: '补蛋白且脂肪较低' },
    { food_id: 'broccoli', name: '西兰花', serving_grams: 200, reason: '增加饱腹感' },
    { food_id: 'rice', name: '白米饭', serving_grams: 80, reason: '少量补碳水' },
  ],
  alternatives: [
    { food_id: 'rice', name: '白米饭', serving_grams: 60, reason: '热量更轻' },
  ],
  warnings: ['营养值按候选食物估算。'],
});

describe('AI response handling', () => {
  it('parses fenced JSON and marks low confidence food', () => {
    const parsed = parseRecognitionContent(`\`\`\`json\n${validContent}\n\`\`\``);
    expect(parsed.mealTitle).toBe('香煎鸡胸肉');
    expect(parsed.foods[0].name).toBe('鸡胸肉');
    expect(parsed.foods[0].warning).toContain('把握较低');
  });

  it('builds each supported response mode', () => {
    const base = { baseUrl: 'https://example.com/v1', model: 'vision-model' };
    const jsonSchemaBody = buildRequestBody(
      { ...base, responseMode: 'json_schema' },
      'data:image/jpeg;base64,x',
    );
    expect(jsonSchemaBody.response_format).toMatchObject({ type: 'json_schema' });
    expect(JSON.stringify(jsonSchemaBody)).toContain('meal_title');
    expect(JSON.stringify(jsonSchemaBody)).toContain('通用、简洁的中文食物库名称');
    expect(JSON.stringify(jsonSchemaBody)).toContain('营养成分表');
    expect(JSON.stringify(jsonSchemaBody)).toContain('先读取文字信息');
    expect(
      buildRequestBody({ ...base, responseMode: 'json_object' }, 'data:image/jpeg;base64,x')
        .response_format,
    ).toEqual({ type: 'json_object' });
    expect(
      buildRequestBody({ ...base, responseMode: 'prompt_json' }, 'data:image/jpeg;base64,x'),
    ).not.toHaveProperty('response_format');
  });

  it('builds multi-image recognition requests without duplicating prompt text', () => {
    const body = buildRequestBody(
      { baseUrl: 'https://example.com/v1', model: 'vision-model', responseMode: 'json_object' },
      ['data:image/jpeg;base64,a', 'data:image/jpeg;base64,b'],
    );
    const content = (body.messages as any[])[1].content as any[];

    expect(content.filter((part) => part.type === 'image_url')).toHaveLength(2);
    expect(content.at(-1).text).toContain('不要重复统计同一道可见食物');
  });

  it('builds text-only insight advice requests', () => {
    const body = buildInsightAdviceRequestBody(
      { baseUrl: 'https://example.com/v1', model: 'chat-model', responseMode: 'json_schema' },
      {
        targets: { calories: 1800, protein: 110, carbs: 190, fat: 55 },
        periodDays: 7,
        missingDays: 6,
        days: [
          { dateKey: '2026-06-11', calories: 1710, protein: 90, carbs: 210, fat: 48 },
        ],
      },
    );

    expect(body.response_format).toMatchObject({ type: 'json_schema' });
    const userContent = (body.messages as any[])[1].content as string;
    expect(userContent).toContain('"missing_days":6');
    expect(userContent).toContain('不要把缺失日期当作 0 摄入');
    expect(JSON.stringify(body)).toContain('不提供医疗建议');
    expect(JSON.stringify(body)).not.toContain('image_url');
  });

  it('builds text-only meal suggestion requests from compact candidates', () => {
    const body = buildMealSuggestionRequestBody(
      { baseUrl: 'https://example.com/v1', model: 'chat-model', responseMode: 'json_schema' },
      {
        dateKey: '2026-06-12',
        targetType: 'lunch',
        scope: 'meal',
        mealLabel: '午餐',
        totals: { calories: 1430, protein: 72, carbs: 170, fat: 48 },
        targets: { calories: 2000, protein: 120, carbs: 230, fat: 60 },
        remaining: { calories: 570, protein: 48, carbs: 60, fat: 12 },
        candidates: mealCandidates,
      },
    );

    expect(body.response_format).toMatchObject({ type: 'json_schema' });
    expect(JSON.stringify(body)).not.toContain('image_url');
    expect(JSON.stringify(body)).toContain('只从 candidates 里挑食物');
    const userContent = (body.messages as any[])[1].content as string;
    expect(userContent).toContain('下一顿正餐（午餐）');
    expect(userContent).toContain('"target_type":"lunch"');
    expect(userContent).toContain('"scope":"meal"');
    expect(userContent).toContain('"id":"chicken"');
    expect(userContent).toContain('"serving_grams":120');
    expect(userContent).not.toContain('aliases');
    expect(userContent).not.toContain('sourceReference');
  });

  it('builds full-day next-day meal suggestion requests', () => {
    const body = buildMealSuggestionRequestBody(
      { baseUrl: 'https://example.com/v1', model: 'chat-model', responseMode: 'json_object' },
      {
        dateKey: '2026-06-13',
        targetType: 'full_day',
        scope: 'full_day',
        mealLabel: '明日整天',
        totals: { calories: 0, protein: 0, carbs: 0, fat: 0 },
        targets: { calories: 2000, protein: 120, carbs: 230, fat: 60 },
        remaining: { calories: 2000, protein: 120, carbs: 230, fat: 60 },
        candidates: mealCandidates,
      },
    );

    const userContent = (body.messages as any[])[1].content as string;
    expect(userContent).toContain('明天整天怎么吃');
    expect(userContent).toContain('"target_type":"full_day"');
    expect(userContent).toContain('"scope":"full_day"');
    expect(userContent).toContain('明日早餐、午餐、晚餐');
    expect(JSON.stringify(body)).not.toContain('image_url');
  });

  it('parses insight advice JSON', () => {
    const parsed = parseInsightAdviceContent(`\`\`\`json\n${validAdviceContent}\n\`\`\``);

    expect(parsed.title).toBe('晚餐稳一点');
    expect(parsed.actions).toHaveLength(2);
    expect(parsed.warnings[0]).toContain('趋势可能偏低');
  });

  it('parses meal suggestion JSON and resolves candidate nutrition', () => {
    const parsed = parseMealSuggestionContent(
      `\`\`\`json\n${validMealSuggestionContent}\n\`\`\``,
      mealCandidates,
    );

    expect(parsed.title).toBe('清淡补蛋白');
    expect(parsed.combo).toHaveLength(3);
    expect(parsed.combo[0]).toMatchObject({ foodId: 'chicken', calories: 198 });
    expect(parsed.combo[2]).toMatchObject({ foodId: 'rice', servingGrams: 80, calories: 104 });
    expect(parsed.alternatives[0].reason).toContain('热量');
    expect(parsed.warnings[0]).toContain('估算');
  });

  it('requests and parses nutrition insight advice', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: validAdviceContent } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await generateNutritionInsightAdvice(
      { baseUrl: 'https://example.com/v1', model: 'chat-model', responseMode: 'json_object' },
      'secret-key',
      {
        targets: { calories: 1800, protein: 110, carbs: 190, fat: 55 },
        days: [{ dateKey: '2026-06-11', calories: 1710, protein: 90, carbs: 210, fat: 48 }],
      },
      fetchMock as typeof fetch,
    );

    expect(result.summary).toContain('热量波动');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('requests and parses meal suggestion advice', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: validMealSuggestionContent } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await generateMealSuggestionAdvice(
      { baseUrl: 'https://example.com/v1', model: 'chat-model', responseMode: 'json_object' },
      'secret-key',
      {
        dateKey: '2026-06-12',
        targetType: 'lunch',
        scope: 'meal',
        mealLabel: '午餐',
        totals: { calories: 1430, protein: 72, carbs: 170, fat: 48 },
        targets: { calories: 2000, protein: 120, carbs: 230, fat: 60 },
        remaining: { calories: 570, protein: 48, carbs: 60, fat: 12 },
        candidates: mealCandidates,
      },
      fetchMock as typeof fetch,
    );

    expect(result.summary).toContain('低脂蛋白');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back from json_schema to json_object during capability testing', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('unsupported', { status: 400 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ choices: [{ message: { content: validContent } }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    const result = await testProviderConfiguration(
      { baseUrl: 'https://example.com/v1', model: 'vision-model' },
      'secret-key',
      fetchMock as typeof fetch,
    );
    expect(result.responseMode).toBe('json_object');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('uses a vision-compatible image for capability testing', async () => {
    const fetchMock = vi.fn().mockImplementation((_url, init) => {
      const body = JSON.parse(String(init?.body));
      const imageDataUri = body.messages[1].content[0].image_url.url as string;
      const imageBytes = Buffer.from(imageDataUri.split(',')[1], 'base64');

      expect(imageDataUri).toMatch(/^data:image\/png;base64,/);
      expect(imageBytes.readUInt32BE(16)).toBeGreaterThanOrEqual(10);
      expect(imageBytes.readUInt32BE(20)).toBeGreaterThanOrEqual(10);

      return Promise.resolve(
        new Response(
          JSON.stringify({ choices: [{ message: { content: validContent } }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    });

    await testProviderConfiguration(
      { baseUrl: 'https://example.com/v1', model: 'vision-model' },
      'secret-key',
      fetchMock as typeof fetch,
    );
  });

  it('shows nested provider error messages without dumping the response envelope', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error: {
              message: 'The image format is illegal and cannot be opened',
              code: 'invalid_parameter_error',
            },
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    await expect(
      testProviderConfiguration(
        { baseUrl: 'https://example.com/v1', model: 'vision-model' },
        'secret-key',
        fetchMock as typeof fetch,
      ),
    ).rejects.toThrow('The image format is illegal and cannot be opened');
  });

  it.each([
    [401, 'auth'],
    [429, 'rate_limit'],
  ])('maps HTTP %i to %s', async (status, code) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status }));
    await expect(
      testProviderConfiguration(
        { baseUrl: 'https://example.com/v1', model: 'vision-model' },
        'secret-key',
        fetchMock as typeof fetch,
      ),
    ).rejects.toMatchObject({ code });
  });

  it('rejects non-JSON content', () => {
    expect(() => parseRecognitionContent('not json')).toThrow(AIProviderError);
  });
});
