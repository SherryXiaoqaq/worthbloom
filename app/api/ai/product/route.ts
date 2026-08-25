import type { ProductAnalysis, WishCategory } from '@/lib/ai-types';
import { AiAuthorizationError, authorizeAiRequest } from '@/lib/server/ai/authorize';
import { AiServiceError, generateJson } from '@/lib/server/ai/client';
import { ProductSourceError, readProductPage } from '@/lib/server/ai/product-source';

export const dynamic = 'force-dynamic';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const categories: WishCategory[] = ['课程', '会员', '储值', '实物', '旅行体验'];

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + 0x8000, bytes.length)));
  }
  return btoa(binary);
}

function stringOrNull(value: unknown, max = 300) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

function numberOrNull(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function stringArray(value: unknown, maxItems = 5) {
  return Array.isArray(value)
    ? value.filter(item => typeof item === 'string' && item.trim()).slice(0, maxItems).map(item => String(item).trim().slice(0, 180))
    : [];
}

function normalizeAnalysis(raw: Record<string, unknown>, sourceWarnings: string[]): ProductAnalysis {
  const category = categories.includes(raw.category as WishCategory) ? raw.category as WishCategory : '实物';
  const expiry = stringOrNull(raw.expiry_date, 10);
  const confidence = Number(raw.confidence);
  return {
    name: stringOrNull(raw.name, 120),
    price: numberOrNull(raw.price),
    category,
    total_units: numberOrNull(raw.total_units),
    usage_frequency: stringOrNull(raw.usage_frequency, 120),
    expiry_date: expiry && /^\d{4}-\d{2}-\d{2}$/.test(expiry) ? expiry : null,
    summary: stringOrNull(raw.summary, 300) || '已整理截图或商品页面中的信息。',
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5,
    evidence: stringArray(raw.evidence),
    warnings: [...sourceWarnings, ...stringArray(raw.warnings)].slice(0, 6),
  };
}

export async function POST(request: Request) {
  try {
    await authorizeAiRequest(request);
    const form = await request.formData();
    const sourceUrl = String(form.get('sourceUrl') || '').trim();
    const imageValue = form.get('image');
    const image = imageValue instanceof File && imageValue.size > 0 ? imageValue : null;
    if (!sourceUrl && !image) return Response.json({ error: '请粘贴商品链接或上传一张截图' }, { status: 400 });

    if (image && (!IMAGE_TYPES.has(image.type) || image.size > MAX_IMAGE_BYTES)) {
      return Response.json({ error: '截图仅支持 JPG、PNG、WebP，且不能超过 5MB' }, { status: 400 });
    }

    const sourceWarnings: string[] = [];
    let page: Awaited<ReturnType<typeof readProductPage>> | null = null;
    if (sourceUrl) {
      try { page = await readProductPage(sourceUrl); }
      catch (error) {
        if (!image) throw error;
        sourceWarnings.push(error instanceof Error ? `${error.message}，本次主要根据截图识别。` : '商品链接无法读取，本次主要根据截图识别。');
      }
    }

    const imageInput = image
      ? { base64: bytesToBase64(new Uint8Array(await image.arrayBuffer())), mimeType: image.type }
      : undefined;
    const schemaExample = {
      name: '商品或服务名称，无法确认则为 null',
      price: '人民币数字，无法确认则为 null',
      category: '课程/会员/储值/实物/旅行体验 五选一',
      total_units: '次数、节数或天数，无法确认则为 null',
      usage_frequency: '适合如何使用的客观信息，无法确认则为 null',
      expiry_date: '明确截止日期 YYYY-MM-DD，无法确认则为 null',
      summary: '不超过80字的商品摘要',
      confidence: '0到1之间的数字',
      evidence: ['识别依据，最多5条'],
      warnings: ['不确定、优惠价条件或需用户核对的内容'],
    };
    const { data, meta } = await generateJson({
      system: '你是 WorthBloom 的商品信息整理助手。只提取图片和网页中有依据的信息，不猜测、不编造，也不要替用户写购买理由。价格优先使用实际到手价；如果存在会员价、定金或优惠条件，放进 warnings。只返回合法 JSON。',
      prompt: [
        `今天是 ${new Date().toISOString().slice(0, 10)}。`,
        page?.promptText || (sourceUrl ? `用户提供的原始链接：${sourceUrl}` : ''),
        '请提取可用于创建心愿的字段。截止日期只有页面明确给出时才填写。',
        `严格返回以下 JSON 结构：${JSON.stringify(schemaExample)}`,
      ].filter(Boolean).join('\n\n'),
      image: imageInput,
    });

    return Response.json({
      analysis: normalizeAnalysis(data, sourceWarnings),
      sourceUrl: page?.url || sourceUrl || null,
      meta,
    });
  } catch (error) {
    const status = error instanceof AiAuthorizationError || error instanceof AiServiceError || error instanceof ProductSourceError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : '商品识别失败' }, { status });
  }
}
