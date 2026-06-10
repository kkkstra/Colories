import { clampNumber } from '@/lib/nutrition';
import { safeErrorMessage } from '@/lib/security';
import type {
  AIProviderConfig,
  AIRecognizedFood,
  AIResponseMode,
  FoodRecognitionResult,
} from '@/types/domain';

const REQUEST_TIMEOUT_MS = 45_000;
const TEST_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR4nGP8z8DAwMDAxMDAwMAAAAwBAQDJ/pLvAAAAAElFTkSuQmCC';

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['foods', 'warnings'],
  properties: {
    foods: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'name',
          'estimated_weight_grams',
          'cooking_method',
          'confidence',
          'nutrition',
        ],
        properties: {
          name: { type: 'string' },
          estimated_weight_grams: { type: 'number' },
          cooking_method: { type: 'string' },
          confidence: { type: 'number' },
          warning: { type: 'string' },
          nutrition: {
            type: 'object',
            additionalProperties: false,
            required: ['calories', 'protein', 'carbs', 'fat'],
            properties: {
              calories: { type: 'number' },
              protein: { type: 'number' },
              carbs: { type: 'number' },
              fat: { type: 'number' },
            },
          },
        },
      },
    },
    warnings: {
      type: 'array',
      items: { type: 'string' },
    },
  },
} as const;

type FetchLike = typeof fetch;

export class AIProviderError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'auth'
      | 'rate_limit'
      | 'timeout'
      | 'network'
      | 'unsupported'
      | 'invalid_response',
  ) {
    super(message);
    this.name = 'AIProviderError';
  }
}

export const DASHSCOPE_PRESET = {
  baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  model: 'qwen3.7-plus',
} as const;

export async function testProviderConfiguration(
  input: Omit<AIProviderConfig, 'responseMode'>,
  apiKey: string,
  fetchImpl: FetchLike = fetch,
): Promise<AIProviderConfig> {
  const modes: AIResponseMode[] = ['json_schema', 'json_object', 'prompt_json'];
  let lastError: unknown;
  for (const responseMode of modes) {
    try {
      await requestRecognition(
        { ...input, responseMode },
        apiKey,
        TEST_IMAGE,
        true,
        fetchImpl,
      );
      return { ...input, responseMode };
    } catch (error) {
      if (error instanceof AIProviderError && ['auth', 'rate_limit', 'timeout', 'network'].includes(error.code)) {
        throw error;
      }
      lastError = error;
    }
  }
  throw new AIProviderError(
    `接口可访问，但未返回兼容的图片 JSON 结果。${safeErrorMessage(lastError)}`,
    'unsupported',
  );
}

export async function recognizeFoodImage(
  config: AIProviderConfig,
  apiKey: string,
  imageDataUri: string,
  fetchImpl: FetchLike = fetch,
): Promise<FoodRecognitionResult> {
  return requestRecognition(config, apiKey, imageDataUri, false, fetchImpl);
}

async function requestRecognition(
  config: AIProviderConfig,
  apiKey: string,
  imageDataUri: string,
  isTest: boolean,
  fetchImpl: FetchLike,
): Promise<FoodRecognitionResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(toChatCompletionsUrl(config.baseUrl), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildRequestBody(config, imageDataUri, isTest)),
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403) {
      throw new AIProviderError('API Key 无效或没有该模型的访问权限。', 'auth');
    }
    if (response.status === 429) {
      throw new AIProviderError('模型服务请求过于频繁或余额不足，请稍后重试。', 'rate_limit');
    }
    if (!response.ok) {
      const details = await response.text();
      throw new AIProviderError(
        `模型服务返回 ${response.status}：${details.slice(0, 180)}`,
        response.status === 400 || response.status === 404 ? 'unsupported' : 'network',
      );
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const content = extractMessageContent(payload);
    return parseRecognitionContent(content);
  } catch (error) {
    if (error instanceof AIProviderError) {
      throw error;
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AIProviderError('模型服务响应超时，请检查网络后重试。', 'timeout');
    }
    throw new AIProviderError(`无法连接模型服务：${safeErrorMessage(error, apiKey)}`, 'network');
  } finally {
    clearTimeout(timeout);
  }
}

export function buildRequestBody(
  config: AIProviderConfig,
  imageDataUri: string,
  isTest = false,
): Record<string, unknown> {
  const instruction = isTest
    ? '这是一次能力测试。即使图片里没有食物，也必须返回 foods 空数组和 warnings 数组。'
    : `识别图片中所有可见食物并估算可食用重量、烹饪方式、热量、蛋白质、碳水和脂肪。
重量和营养值必须对应图片中本次可见份量，不是每100克。无法判断时降低 confidence 并写入 warning。
不要把餐具、包装或桌面识别为食物。`;

  const body: Record<string, unknown> = {
    model: config.model.trim(),
    temperature: 0.1,
    messages: [
      {
        role: 'system',
        content:
          '你是谨慎的食物营养识别助手。只输出符合要求的 JSON，不给医疗建议，不夸大视觉估算的准确性。',
      },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageDataUri } },
          {
            type: 'text',
            text: `${instruction}\nJSON 字段：foods, warnings；每个 food 包含 name, estimated_weight_grams, cooking_method, confidence, nutrition(calories, protein, carbs, fat), warning。`,
          },
        ],
      },
    ],
  };

  if (config.responseMode === 'json_schema') {
    body.response_format = {
      type: 'json_schema',
      json_schema: {
        name: 'food_recognition',
        strict: true,
        schema: RESPONSE_SCHEMA,
      },
    };
  } else if (config.responseMode === 'json_object') {
    body.response_format = { type: 'json_object' };
  }
  return body;
}

export function parseRecognitionContent(content: string): FoodRecognitionResult {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new AIProviderError('模型没有返回有效 JSON，请在设置中重新测试接口。', 'invalid_response');
  }

  if (!isObject(parsed) || !Array.isArray(parsed.foods)) {
    throw new AIProviderError('模型 JSON 缺少 foods 数组。', 'invalid_response');
  }

  const foods = parsed.foods.map(parseFood).filter((food): food is AIRecognizedFood => food !== null);
  const warnings = Array.isArray(parsed.warnings)
    ? parsed.warnings.filter((value): value is string => typeof value === 'string')
    : [];
  return { foods, warnings };
}

function parseFood(value: unknown): AIRecognizedFood | null {
  if (!isObject(value) || typeof value.name !== 'string' || !isObject(value.nutrition)) {
    return null;
  }
  const confidence = clampNumber(value.confidence, 0.5, 0, 1);
  const warning =
    typeof value.warning === 'string'
      ? value.warning
      : confidence < 0.65
        ? 'AI 对该食物或份量把握较低，请重点确认。'
        : undefined;
  return {
    name: value.name.trim() || '未命名食物',
    estimatedWeightGrams: clampNumber(value.estimated_weight_grams, 100, 1, 5000),
    cookingMethod: typeof value.cooking_method === 'string' ? value.cooking_method : '未知',
    confidence,
    warning,
    nutrition: {
      calories: clampNumber(value.nutrition.calories, 0),
      protein: clampNumber(value.nutrition.protein, 0),
      carbs: clampNumber(value.nutrition.carbs, 0),
      fat: clampNumber(value.nutrition.fat, 0),
    },
  };
}

function extractMessageContent(payload: Record<string, unknown>): string {
  const choices = payload.choices;
  if (!Array.isArray(choices) || !isObject(choices[0]) || !isObject(choices[0].message)) {
    throw new AIProviderError('模型响应缺少 choices[0].message。', 'invalid_response');
  }
  const content = choices[0].message.content;
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => (isObject(part) && typeof part.text === 'string' ? part.text : ''))
      .join('');
  }
  throw new AIProviderError('模型响应没有文本内容。', 'invalid_response');
}

function toChatCompletionsUrl(baseUrl: string): string {
  const cleaned = baseUrl.trim().replace(/\/+$/, '');
  return cleaned.endsWith('/chat/completions') ? cleaned : `${cleaned}/chat/completions`;
}

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null;
}
