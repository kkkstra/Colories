import { describe, expect, it, vi } from 'vitest';

import {
  AIProviderError,
  buildRequestBody,
  parseRecognitionContent,
  testProviderConfiguration,
} from '@/lib/ai';

const validContent = JSON.stringify({
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

describe('AI response handling', () => {
  it('parses fenced JSON and marks low confidence food', () => {
    const parsed = parseRecognitionContent(`\`\`\`json\n${validContent}\n\`\`\``);
    expect(parsed.foods[0].name).toBe('鸡胸肉');
    expect(parsed.foods[0].warning).toContain('把握较低');
  });

  it('builds each supported response mode', () => {
    const base = { baseUrl: 'https://example.com/v1', model: 'vision-model' };
    expect(
      buildRequestBody({ ...base, responseMode: 'json_schema' }, 'data:image/jpeg;base64,x')
        .response_format,
    ).toMatchObject({ type: 'json_schema' });
    expect(
      buildRequestBody({ ...base, responseMode: 'json_object' }, 'data:image/jpeg;base64,x')
        .response_format,
    ).toEqual({ type: 'json_object' });
    expect(
      buildRequestBody({ ...base, responseMode: 'prompt_json' }, 'data:image/jpeg;base64,x'),
    ).not.toHaveProperty('response_format');
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
