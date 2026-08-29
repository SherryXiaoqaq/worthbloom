import 'server-only';

export class AiServiceError extends Error {
  constructor(message: string, public status = 500) {
    super(message);
  }
}

type ChatContent =
  | string
  | Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
    >;

type ChatResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
};

const DEFAULT_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4';
const DEFAULT_VISION_MODEL = 'glm-4.6v-flash';
const DEFAULT_TEXT_MODEL = 'glm-4.7-flash';
const DEFAULT_VISION_FALLBACK_MODEL = 'glm-4v-flash';
const DEFAULT_TEXT_FALLBACK_MODEL = 'glm-4-flash-250414';

export function isAiConfigured() {
  return Boolean(process.env.ZHIPU_API_KEY || process.env.AI_API_KEY);
}

function config() {
  const apiKey = process.env.ZHIPU_API_KEY || process.env.AI_API_KEY;
  if (!apiKey) {
    throw new AiServiceError('AI 尚未配置：请先在 .env.local 填写 ZHIPU_API_KEY', 503);
  }

  const baseUrl = (process.env.ZHIPU_BASE_URL || process.env.AI_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
  return {
    apiKey,
    endpoint: baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`,
    visionModel: process.env.ZHIPU_VISION_MODEL || DEFAULT_VISION_MODEL,
    textModel: process.env.ZHIPU_TEXT_MODEL || DEFAULT_TEXT_MODEL,
    visionFallbackModel: process.env.ZHIPU_VISION_FALLBACK_MODEL || DEFAULT_VISION_FALLBACK_MODEL,
    textFallbackModel: process.env.ZHIPU_TEXT_FALLBACK_MODEL || DEFAULT_TEXT_FALLBACK_MODEL,
  };
}

function isCapacityError(status: number, detail: string) {
  return status === 429
    || status === 503
    || /调用量|并发|繁忙|稍后重试|rate.?limit|too many|capacity|overload/i.test(detail);
}

function modelsFor(settings: ReturnType<typeof config>, hasImage: boolean) {
  return [...new Set(hasImage
    ? [settings.visionModel, settings.visionFallbackModel]
    : [settings.textModel, settings.textFallbackModel]
  )].filter(Boolean);
}

function parseJsonObject(raw: string) {
  const trimmed = raw.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start < 0 || end <= start) throw new AiServiceError('AI 没有返回可解析的数据，请重试', 502);
  try {
    return JSON.parse(unfenced.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    throw new AiServiceError('AI 返回格式不完整，请重试', 502);
  }
}

export async function generateJson({
  system,
  prompt,
  image,
  maxTokens = 900,
  preferFast = false,
}: {
  system: string;
  prompt: string;
  image?: { base64: string; mimeType: string };
  maxTokens?: number;
  preferFast?: boolean;
}) {
  const settings = config();
  const imageUrl = image
    ? image.base64.startsWith('data:')
      ? image.base64
      : `data:${image.mimeType};base64,${image.base64}`
    : '';
  const content: ChatContent = image
    ? [
        { type: 'image_url', image_url: { url: imageUrl } },
        { type: 'text', text: prompt },
      ]
    : prompt;
  const configuredModels = modelsFor(settings, Boolean(image));
  const models = preferFast && !image ? [...configuredModels].reverse() : configuredModels;
  let lastFailure: AiServiceError | null = null;

  for (const [index, model] of models.entries()) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), image ? 30_000 : 15_000);
    try {
      const supportsThinkingSwitch = /^glm-4\.[5-9]/i.test(model);
      const response = await fetch(settings.endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${settings.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content },
          ],
          max_tokens: maxTokens,
          temperature: 0.2,
          ...(supportsThinkingSwitch ? { thinking: { type: 'disabled' } } : {}),
          ...(image ? {} : { response_format: { type: 'json_object' } }),
        }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({})) as ChatResponse;
      if (!response.ok) {
        const detail = payload.error?.message || `HTTP ${response.status}`;
        if (isCapacityError(response.status, detail)) {
          lastFailure = new AiServiceError('免费模型当前请求较多，请过几秒再试', 503);
          if (index < models.length - 1) continue;
          throw lastFailure;
        }
        throw new AiServiceError(`智谱 AI 调用失败：${detail}`, response.status === 401 ? 503 : 502);
      }
      const text = payload.choices?.[0]?.message?.content;
      if (!text) throw new AiServiceError('AI 没有返回内容，请稍后重试', 502);
      return { data: parseJsonObject(text), meta: { provider: 'zhipu' as const, model } };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        lastFailure = new AiServiceError('AI 响应超时，请稍后重试', 504);
        if (index < models.length - 1) continue;
        throw lastFailure;
      }
      if (error instanceof AiServiceError) throw error;
      throw new AiServiceError(error instanceof Error ? `AI 连接失败：${error.message}` : 'AI 连接失败', 502);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastFailure || new AiServiceError('AI 暂时无法响应，请稍后重试', 503);
}
