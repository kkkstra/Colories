import { clampNumber } from '@/lib/nutrition';
import { normalizeMealTitle } from '@/lib/mealTitle';
import { safeErrorMessage } from '@/lib/security';
import type {
  AIProviderConfig,
  AIRecognizedFood,
  AIResponseMode,
  DailyTargets,
  MealSuggestionAdvice,
  MealSuggestionCandidate,
  MealSuggestionFood,
  MealSuggestionScope,
  MealSuggestionTargetType,
  FoodRecognitionResult,
  MacroValues,
  NutritionInsightAdvice,
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

const INSIGHT_ADVICE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'summary', 'actions', 'warnings'],
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    actions: {
      type: 'array',
      items: { type: 'string' },
    },
    warnings: {
      type: 'array',
      items: { type: 'string' },
    },
  },
} as const;

const MEAL_SUGGESTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'summary', 'combo', 'alternatives', 'warnings'],
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    combo: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'serving_grams', 'reason'],
        properties: {
          food_id: { type: 'string' },
          name: { type: 'string' },
          serving_grams: { type: 'number' },
          reason: { type: 'string' },
        },
      },
    },
    alternatives: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'serving_grams', 'reason'],
        properties: {
          food_id: { type: 'string' },
          name: { type: 'string' },
          serving_grams: { type: 'number' },
          reason: { type: 'string' },
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

export interface NutritionInsightAdviceInput {
  targets: DailyTargets;
  days: readonly (MacroValues & { dateKey: string })[];
  periodDays?: number;
  missingDays?: number;
}

export interface MealSuggestionAdviceInput {
  dateKey: string;
  targetType: MealSuggestionTargetType;
  scope: MealSuggestionScope;
  mealLabel: string;
  totals: MacroValues;
  targets: DailyTargets;
  remaining: MacroValues;
  candidates: readonly MealSuggestionCandidate[];
}

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
  return recognizeFoodImages(config, apiKey, [imageDataUri], fetchImpl);
}

export async function recognizeFoodImages(
  config: AIProviderConfig,
  apiKey: string,
  imageDataUris: readonly string[],
  fetchImpl: FetchLike = fetch,
): Promise<FoodRecognitionResult> {
  if (imageDataUris.length === 0) {
    throw new AIProviderError('请先选择至少一张图片。', 'invalid_response');
  }
  return requestRecognition(config, apiKey, imageDataUris, false, fetchImpl);
}

export async function generateNutritionInsightAdvice(
  config: AIProviderConfig,
  apiKey: string,
  input: NutritionInsightAdviceInput,
  fetchImpl: FetchLike = fetch,
): Promise<NutritionInsightAdvice> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(toChatCompletionsUrl(config.baseUrl), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildInsightAdviceRequestBody(config, input)),
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
    return parseInsightAdviceContent(content);
  } catch (error) {
    if (error instanceof AIProviderError) {
      throw error;
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AIProviderError('模型服务响应超时，请稍后再试。', 'timeout');
    }
    throw new AIProviderError(`无法连接模型服务：${safeErrorMessage(error, apiKey)}`, 'network');
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateMealSuggestionAdvice(
  config: AIProviderConfig,
  apiKey: string,
  input: MealSuggestionAdviceInput,
  fetchImpl: FetchLike = fetch,
): Promise<MealSuggestionAdvice> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(toChatCompletionsUrl(config.baseUrl), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildMealSuggestionRequestBody(config, input)),
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
    return parseMealSuggestionContent(content, input.candidates);
  } catch (error) {
    if (error instanceof AIProviderError) {
      throw error;
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AIProviderError('模型服务响应超时，请稍后再试。', 'timeout');
    }
    throw new AIProviderError(`无法连接模型服务：${safeErrorMessage(error, apiKey)}`, 'network');
  } finally {
    clearTimeout(timeout);
  }
}

async function requestRecognition(
  config: AIProviderConfig,
  apiKey: string,
  imageDataUris: string | readonly string[],
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
      body: JSON.stringify(buildRequestBody(config, imageDataUris, isTest)),
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
  imageDataUris: string | readonly string[],
  isTest = false,
): Record<string, unknown> {
  const images = Array.isArray(imageDataUris) ? imageDataUris : [imageDataUris];
  const instruction = isTest
    ? '这是一次能力测试。即使图片里没有食物，也必须返回 meal_title 空字符串、foods 空数组和 warnings 数组。'
    : `识别图片中所有可见食物并估算可食用重量、烹饪方式、热量、蛋白质、碳水和脂肪。
如果有多张图片，它们可能是同一餐的不同角度或同一餐的不同菜品；综合所有图片判断，不要重复统计同一道可见食物。
如果图片包含包装正面、营养成分表、配料表、菜单或标签文字，先读取文字信息；优先使用营养成分表上的每100g/每100ml或每份数据，并结合净含量、份量和实际食用量换算到本次记录。
如果只看到配料表或包装文字但没有完整营养值，保留可读出的食物名称线索，降低 confidence，并在 warning 说明哪些营养值是估算。
重量和营养值必须对应图片中本次可见份量，不是每100克。无法判断时降低 confidence 并写入 warning。
优先输出通用、简洁的中文食物库名称，例如“白米饭”“鸡胸肉”“番茄炒蛋”“牛肉面”，不要输出冗长描述或品牌名。
如果是组合餐且能看出常见菜名，优先输出常见菜名；看不出时拆成主要可见食材。
不要把餐具、桌面或空包装识别为食物；但包装和标签上的文字可以作为营养估算依据。
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
          ...images.map((imageDataUri) => ({
            type: 'image_url',
            image_url: { url: imageDataUri },
          })),
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

export function buildInsightAdviceRequestBody(
  config: AIProviderConfig,
  input: NutritionInsightAdviceInput,
): Record<string, unknown> {
  const data = {
    period_days: input.periodDays ?? input.days.length,
    recorded_days: input.days.length,
    missing_days: input.missingDays ?? 0,
    targets: normalizeInsightNumbers(input.targets),
    days: input.days.map((day) => ({
      date: day.dateKey,
      ...normalizeInsightNumbers(day),
    })),
  };
  const body: Record<string, unknown> = {
    model: config.model.trim(),
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content:
          '你是谨慎、具体的饮食记录分析助手。只基于用户记录和目标给饮食建议，不提供医疗建议，不诊断疾病，不夸大估算准确性。',
      },
      {
        role: 'user',
        content: `根据最近一段时间饮食汇总和目标，输出给普通用户看的中文 JSON 建议。
要求：
- title 12 个中文以内。
- summary 用一句话概括最值得注意的趋势。
- actions 给 2-3 条可执行建议，避免泛泛而谈。
- warnings 只写需要用户核对的数据问题或明显风险；没有就返回空数组。
- 不要要求用户节食到低于目标很多，不要使用医疗诊断或保证性表达。
- days 只包含有记录的日期；missing_days 是没有记录的天数，不要把缺失日期当作 0 摄入或据此判断吃得少。
- 如果 missing_days 较多，只作为记录完整度提醒，避免对趋势下确定结论。

数据：${JSON.stringify(data)}

只输出 JSON，字段为 title, summary, actions, warnings。`,
      },
    ],
  };

  if (config.responseMode === 'json_schema') {
    body.response_format = {
      type: 'json_schema',
      json_schema: {
        name: 'nutrition_insight_advice',
        strict: true,
        schema: INSIGHT_ADVICE_SCHEMA,
      },
    };
  } else if (config.responseMode === 'json_object') {
    body.response_format = { type: 'json_object' };
  }
  return body;
}

export function buildMealSuggestionRequestBody(
  config: AIProviderConfig,
  input: MealSuggestionAdviceInput,
): Record<string, unknown> {
  const data = {
    date: input.dateKey,
    target_type: input.targetType,
    scope: input.scope,
    meal_label: input.mealLabel,
    totals: normalizeInsightNumbers(input.totals),
    targets: normalizeInsightNumbers(input.targets),
    remaining: normalizeInsightNumbers(input.remaining),
    candidates: input.candidates.map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      category: candidate.category,
      serving_grams: candidate.servingGrams,
      nutrition: normalizeInsightNumbers(candidate),
    })),
  };
  const body: Record<string, unknown> = {
    model: config.model.trim(),
    temperature: 0.25,
    messages: [
      {
        role: 'system',
        content:
          '你是谨慎、具体的正餐与全天饮食决策助手。只基于记录、目标、建议范围和候选食物给建议，不提供医疗建议，不诊断疾病，不夸大估算准确性。',
      },
      {
        role: 'user',
        content: `${buildMealSuggestionPromptIntro(input)}
要求：
- 只从 candidates 里挑食物；不要编造 candidates 以外的食物。
- ${input.scope === 'full_day'
  ? 'combo 给 2-3 个能覆盖明日早餐、午餐、晚餐节奏的候选食物，reason 标明更适合放在哪一餐。'
  : `combo 给 2-3 个可一起吃的${input.mealLabel}组成，优先照顾剩余蛋白、碳水、脂肪和热量。`}
- alternatives 给 2-3 个替代单品，方便用户按口味替换。
- 每个食物必须包含候选 food_id、name、serving_grams 和一句短 reason。
- title 12 个中文以内；summary 一句话说明${input.scope === 'full_day' ? '明日全天' : '今天这餐'}的取舍。
- warnings 只写明显超标、估算或配置风险；没有就返回空数组。
- 如果 remaining.calories 已经小于 0，建议清淡一点，不要鼓励补足所有宏量。
- 不要要求用户节食到低于目标很多，不要使用医疗诊断或保证性表达。

数据：${JSON.stringify(data)}

只输出 JSON，字段为 title, summary, combo, alternatives, warnings。`,
      },
    ],
  };

  if (config.responseMode === 'json_schema') {
    body.response_format = {
      type: 'json_schema',
      json_schema: {
        name: 'meal_suggestion_advice',
        strict: true,
        schema: MEAL_SUGGESTION_SCHEMA,
      },
    };
  } else if (config.responseMode === 'json_object') {
    body.response_format = { type: 'json_object' };
  }
  return body;
}

function buildMealSuggestionPromptIntro(input: MealSuggestionAdviceInput): string {
  if (input.scope === 'full_day') {
    return `晚餐时间已过，请根据明天的目标热量和三大营养素，给出“明天整天怎么吃”的中文 JSON 建议。`;
  }
  return `根据下一顿正餐（${input.mealLabel}）以及今天已经摄入的热量和三大营养素，给出“这餐还适合吃什么”的中文 JSON 建议。`;
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

export function parseInsightAdviceContent(content: string): NutritionInsightAdvice {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new AIProviderError('模型没有返回有效建议 JSON。', 'invalid_response');
  }

  if (!isObject(parsed) || typeof parsed.summary !== 'string' || !parsed.summary.trim()) {
    throw new AIProviderError('模型建议 JSON 缺少 summary。', 'invalid_response');
  }
  const actions = normalizeStringList(parsed.actions, 3);
  if (actions.length === 0) {
    throw new AIProviderError('模型建议 JSON 缺少 actions。', 'invalid_response');
  }
  const title = typeof parsed.title === 'string' ? parsed.title.trim() : '';
  return {
    title: title || '本周建议',
    summary: parsed.summary.trim(),
    actions,
    warnings: normalizeStringList(parsed.warnings, 2),
  };
}

export function parseMealSuggestionContent(
  content: string,
  candidates: readonly MealSuggestionCandidate[] = [],
): MealSuggestionAdvice {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new AIProviderError('模型没有返回有效当前餐建议 JSON。', 'invalid_response');
  }

  if (!isObject(parsed) || typeof parsed.summary !== 'string' || !parsed.summary.trim()) {
    throw new AIProviderError('模型当前餐建议 JSON 缺少 summary。', 'invalid_response');
  }
  const combo = parseMealSuggestionFoods(parsed.combo, candidates, 3);
  if (combo.length === 0) {
    throw new AIProviderError('模型当前餐建议 JSON 缺少 combo。', 'invalid_response');
  }
  const title = typeof parsed.title === 'string' ? parsed.title.trim() : '';
  return {
    title: title || '当前餐建议',
    summary: parsed.summary.trim(),
    combo,
    alternatives: parseMealSuggestionFoods(parsed.alternatives, candidates, 3),
    warnings: normalizeStringList(parsed.warnings, 2),
  };
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

function normalizeStringList(value: unknown, maxLength: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxLength);
}

function parseMealSuggestionFoods(
  value: unknown,
  candidates: readonly MealSuggestionCandidate[],
  maxLength: number,
): MealSuggestionFood[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => parseMealSuggestionFood(item, candidates))
    .filter((food): food is MealSuggestionFood => food !== null)
    .slice(0, maxLength);
}

function parseMealSuggestionFood(
  value: unknown,
  candidates: readonly MealSuggestionCandidate[],
): MealSuggestionFood | null {
  if (!isObject(value) || typeof value.name !== 'string') {
    return null;
  }
  const foodId = typeof value.food_id === 'string' ? value.food_id : undefined;
  const servingGrams = clampNumber(value.serving_grams, 100, 1, 1000);
  const candidate = candidates.find((item) => item.id === foodId)
    ?? candidates.find((item) => item.name === value.name);
  const factor = candidate ? servingGrams / candidate.servingGrams : 1;
  return {
    foodId: candidate?.id ?? foodId,
    name: candidate?.name ?? value.name.trim(),
    category: candidate?.category,
    servingGrams,
    calories: candidate ? roundForInsight(candidate.calories * factor) : 0,
    protein: candidate ? roundForInsight(candidate.protein * factor) : 0,
    carbs: candidate ? roundForInsight(candidate.carbs * factor) : 0,
    fat: candidate ? roundForInsight(candidate.fat * factor) : 0,
    reason: typeof value.reason === 'string' ? value.reason.trim() : undefined,
  };
}

function normalizeInsightNumbers(values: MacroValues): MacroValues {
  return {
    calories: roundForInsight(values.calories),
    protein: roundForInsight(values.protein),
    carbs: roundForInsight(values.carbs),
    fat: roundForInsight(values.fat),
  };
}

function roundForInsight(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : 0;
}

function toChatCompletionsUrl(baseUrl: string): string {
  const cleaned = baseUrl.trim().replace(/\/+$/, '');
  return cleaned.endsWith('/chat/completions') ? cleaned : `${cleaned}/chat/completions`;
}

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null;
}
