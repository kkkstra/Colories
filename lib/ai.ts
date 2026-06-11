import { clampNumber } from '@/lib/nutrition';
import { normalizeMealTitle } from '@/lib/mealTitle';
import { safeErrorMessage } from '@/lib/security';
import type {
  AIProviderConfig,
  AIRecognizedFood,
  AIResponseMode,
  FoodRecognitionResult,
} from '@/types/domain';

const REQUEST_TIMEOUT_MS = 45_000;
// Keep the capability probe large enough for vision APIs that reject tiny images.
const TEST_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAACXBIWXMAABCcAAAQnAEmzTo0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAP+SURBVHgB1ZrPTxNBFMff21aspJKFEAMVTXvTSCIe5WK9oRfBg8YTJdEzP/wDhD+AX2ejlCPGKDe9ES54tCYmHrsJSevBSK0NVGxnnLdYs7Q77ezuIO3n4jq73b7v+zEzzCuCAlnOzUgJRjjCPQ48iRzigGCCTjgUxDszAJgBBtuxHtxU+Rg2u2kbvg/TnPEZ7Qa3xkLENBiwPngOLdlDUgFf9/k0q/L5UzC8HosBWxiKhtNuN10F5Ep8WcR0BtoKXIlFcbZhtH4gX+JrIs9T0IYIu9IXo6Ep55jh/A95vl2NJxAwdZQdzrG/CM+nhPFr0BHw2Vg0tEJXtoD8AY/zKt8Sl3HoDAq/fmMi0YuFoxRiMAmdYzxhdoWZPcnYEciVWBY6SwBhRyGcK1bG4QSM392rwG6hYl8PD3ZBT8QAzZiRMIyEGWJS96ufvfsOzz8Uj409udkDC3f6QCdVYOOGgXgdNLLxsdRgPEFjbuNBELbfIuePgCYoZZa2CtL7i+JescxAI3ESoG2v80p4v5b3bpDxmqNgakt/MnyxifdrkACdUdAmQMV4goxXfVYFLQLI+5Q+qlAUaJrVgRYBfjw6+/Yb6CCwAK/er7FjlWEnW4agBBYw+0buyZePLsDyRL/0/pKGWggkgDxInnTj6W0Txq52w8MbUXsVdv28higEEiDL40tm2BZQg65pzI2gUfAtYKPJolW/56GNnCyVgkbBtwCZ5yhlKHXqGU1EYOxKt6d3qeBLgMz7lCZzSfnOZOV+v+u2mqLgZyYjfAmQeczO9d6w9HNkvLM2nPhdnT0LaOb9ByJ9WkEz0mg80jDudz3xLEDm/ddTA6DKXJMoeN3oeRIg8z4VbrPUqYcK2m1toHd73W57EuDm/VaFK4Nqwa2gvW63lQXIvN+qcGXICtrrHz3KAmTeVylcGZRGwwNdDeNeoqAk4P2XfVfv02YtKPMuJxVkPH2nCiSg5QTslqtUuNcGuyAoshV6yFRKS/to0Wr1FH2JczPmt3BlLNztO+Ykej99pwIZg3G+rfLkC5EuNRGPRe76KVwZzt0rCVFdU4TtnzD/kyc52ifTLaHc/HHAtBrv5HP+EC6LdysfQyJOYHaPm2fPcDrcPe1emFesWNRIGHTGzjlfhQ5D2LxO/9qxOqwY1O3Qd1hz8lhG2EjThS2AoiA0LUCHQG3XWu/4X7VQz4l1QCqRjc6ecUObNVesiu44TkI7wvh6rCeUcg41zFf0QDtGgmyqN55wnXCHzodmRE+WGsoWnDb0IxDRViWb3G43/bEHtV9ZhaUQ8f93MYXhom+9ehg1VhKI0hkSQZFckY8zZEm7JcVFV+dkfm5j0dYmBMZmOQqZZobX+AN3xr1nX6IyBgAAAABJRU5ErkJggg==';

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['meal_title', 'foods', 'warnings'],
  properties: {
    meal_title: { type: 'string' },
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
      const details = safeErrorMessage(
        extractProviderErrorMessage(await response.text()),
        apiKey,
      );
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
    ? '这是一次能力测试。即使图片里没有食物，也必须返回 meal_title 空字符串、foods 空数组和 warnings 数组。'
    : `识别图片中所有可见食物并估算可食用重量、烹饪方式、热量、蛋白质、碳水和脂肪。
重量和营养值必须对应图片中本次可见份量，不是每100克。无法判断时降低 confidence 并写入 warning。
优先输出通用、简洁的中文食物库名称，例如“白米饭”“鸡胸肉”“番茄炒蛋”“牛肉面”，不要输出冗长描述或品牌名。
如果是组合餐且能看出常见菜名，优先输出常见菜名；看不出时拆成主要可见食材。
不要把餐具、包装或桌面识别为食物。
同时生成 meal_title，用 4-12 个中文字符概括这一餐，例如“鸡腿饭配青菜”“咖啡和贝果”。不要写热量、时间段或“健康餐”这类泛称。`;

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
            text: `${instruction}\nJSON 字段：meal_title, foods, warnings；每个 food 包含 name, estimated_weight_grams, cooking_method, confidence, nutrition(calories, protein, carbs, fat), warning。`,
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
  const mealTitle = typeof parsed.meal_title === 'string'
    ? normalizeMealTitle(parsed.meal_title)
    : undefined;
  const warnings = Array.isArray(parsed.warnings)
    ? parsed.warnings.filter((value): value is string => typeof value === 'string')
    : [];
  return { mealTitle, foods, warnings };
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

function extractProviderErrorMessage(raw: string): string {
  try {
    const payload = JSON.parse(raw) as unknown;
    if (!isObject(payload)) {
      return raw;
    }
    if (isObject(payload.error) && typeof payload.error.message === 'string') {
      return payload.error.message;
    }
    if (typeof payload.message === 'string') {
      return payload.message;
    }
  } catch {
    // Fall back to the provider's plain-text response.
  }
  return raw;
}

function toChatCompletionsUrl(baseUrl: string): string {
  const cleaned = baseUrl.trim().replace(/\/+$/, '');
  return cleaned.endsWith('/chat/completions') ? cleaned : `${cleaned}/chat/completions`;
}

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null;
}
