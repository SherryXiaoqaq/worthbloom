import type { ProductSnapshot, WishType } from '@/lib/types';
import { AiAuthorizationError, authorizeAiRequest } from '@/lib/server/ai/authorize';
import { AiServiceError, generateJson, isAiConfigured } from '@/lib/server/ai/client';
import { ProductSourceError, readProductPage } from '@/lib/server/ai/product-source';
import { extractUrls } from '@/lib/url-extract';
import { categoryToType } from '@/lib/wish-compat';

export const dynamic = 'force-dynamic';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + 0x8000, bytes.length)));
  return btoa(binary);
}

function fallbackSnapshot(raw: string, hint: string, isScreenshot: boolean): ProductSnapshot {
  const priceMatch = raw.match(/(?:¥|￥|价格[:：]?\s*)(\d+(?:\.\d{1,2})?)/);
  const name = raw.replace(/https?:\/\/\S+/g, '').replace(/[¥￥]\s*\d+(?:\.\d{1,2})?/g, '').replace(/复制|打开|链接|商品/g, ' ').trim().slice(0, 32) || (isScreenshot ? '截图中的新心愿' : '一个新的心愿');
  return { name, price: priceMatch ? Number(priceMatch[1]) : null, brand: null, type: 'OTHER' as WishType, category: '其他', image_url: null, source_text: raw || hint, confidence: raw ? 0.58 : 0.25, needs_confirmation: true };
}

function mapAnalysis(raw: Record<string, unknown>): ProductSnapshot {
  const price = Number(raw.price);
  const confidence = Number(raw.confidence);
  const category = typeof raw.category === 'string' && raw.category.trim() ? raw.category.trim() : '其他';
  return {
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 120) : '识别到的新心愿',
    price: Number.isFinite(price) && price >= 0 ? price : null,
    brand: typeof raw.brand === 'string' ? raw.brand.slice(0, 80) : null,
    type: categoryToType(category),
    category,
    skuLabel: typeof raw.sku_label === 'string' ? raw.sku_label.slice(0, 120) : null,
    details: typeof raw.summary === 'string' ? raw.summary.slice(0, 2000) : null,
    sourcePlatform: null,
    images: [],
    image_url: null,
    source_text: typeof raw.summary === 'string' ? raw.summary.slice(0, 300) : '已整理截图或商品页面中的信息。',
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5,
    needs_confirmation: true,
  };
}

function fail(error: string, status: number, code?: string) {
  return Response.json({ error, code }, { status });
}

async function identifyLink(url: string) {
  const page = await readProductPage(url).catch(() => null);
  return { page, url };
}

async function identifyWithAi(url: string | null, page: { promptText: string } | null, image?: { base64: string; mimeType: string }, rawText?: string, hint?: string) {
  const schemaExample = {
    name: '商品或服务名称，无法确认则为 null', price: '人民币数字，无法确认则为 null',
    category: '课程/会员/储值/实物/旅行体验 五选一', total_units: '次数、节数或天数，无法确认则为 null',
    usage_frequency: '适合如何使用的客观信息，无法确认则为 null', expiry_date: '明确截止日期 YYYY-MM-DD，无法确认则为 null',
    summary: '不超过80字的商品摘要', confidence: '0到1之间的数字', evidence: ['识别依据，最多5条'], warnings: ['不确定或需用户核对的内容'],
    brand: '品牌，无法确认则为 null', sku_label: '型号/SKU，无法确认则为 null',
  };
  const { data } = await generateJson({
    system: '你是 WorthBloom 的商品信息整理助手。只提取图片和网页中有依据的信息，不猜测、不编造，也不要替用户写购买理由。价格优先使用实际到手价；如果存在会员价、定金或优惠条件，放进 warnings。只返回合法 JSON。',
    prompt: [
      `今天是 ${new Date().toISOString().slice(0, 10)}。`,
      page?.promptText || (url ? `用户提供的原始链接：${url}` : ''),
      rawText ? `用户补充文本：${rawText}` : '',
      hint ? `提示：${hint}` : '',
      '请提取可用于创建心愿的字段。截止日期只有页面明确给出时才填写。',
      `严格返回以下 JSON 结构：${JSON.stringify(schemaExample)}`,
    ].filter(Boolean).join('\n\n'),
    image,
  });
  return mapAnalysis(data);
}

export async function POST(request: Request) {
  try {
    await authorizeAiRequest(request);
    const contentType = request.headers.get('content-type') ?? '';

    // --- JSON path (spec §9.1): { source:{type,raw}, selectedUrl } ---
    if (contentType.includes('application/json')) {
      const body = await request.json() as { source?: { type?: string; raw?: string }; selectedUrl?: string };
      const type = (body.source?.type ?? 'MANUAL') as 'LINK' | 'SCREENSHOT' | 'MANUAL';
      const raw = String(body.source?.raw ?? '').trim();

      if (type === 'LINK') {
        const { candidates } = extractUrls(raw);
        if (candidates.length === 0) return fail('未识别到商品链接', 422, 'NO_URL_FOUND');
        if (candidates.length > 1 && !body.selectedUrl) {
          return Response.json({ status: 'URL_SELECTION_REQUIRED', urlCandidates: candidates });
        }
        const selectedUrl = body.selectedUrl ?? candidates[0];
        if (!isAiConfigured()) {
          return Response.json({ status: 'READY_FOR_CONFIRMATION', urlCandidates: candidates, selectedUrl, snapshot: fallbackSnapshot(raw, '', false), fallback: true });
        }
        try {
          const { page } = await identifyLink(selectedUrl);
          const snapshot = await identifyWithAi(selectedUrl, page, undefined, raw);
          return Response.json({ status: 'READY_FOR_CONFIRMATION', urlCandidates: candidates, selectedUrl, snapshot, fallback: false });
        } catch {
          return Response.json({ status: 'READY_FOR_CONFIRMATION', urlCandidates: candidates, selectedUrl, snapshot: fallbackSnapshot(raw, '', false), fallback: true });
        }
      }

      if (type === 'SCREENSHOT') {
        // raw may carry a data URL of the screenshot
        const isDataUrl = raw.startsWith('data:image/');
        if (!isAiConfigured() || !isDataUrl) {
          return Response.json({ status: 'READY_FOR_CONFIRMATION', urlCandidates: [], selectedUrl: null, snapshot: fallbackSnapshot(raw, '截图中的商品', true), fallback: true });
        }
        try {
          const image = await fetch(raw).then(r => r.blob());
          if (!IMAGE_TYPES.has(image.type) || image.size > MAX_IMAGE_BYTES) return fail('截图仅支持 JPG、PNG、WebP，且不能超过 5MB', 400, 'IMAGE_INVALID');
          const buf = new Uint8Array(await image.arrayBuffer());
          const snapshot = await identifyWithAi(null, null, { base64: bytesToBase64(buf), mimeType: image.type });
          return Response.json({ status: 'READY_FOR_CONFIRMATION', urlCandidates: [], selectedUrl: null, snapshot, fallback: false });
        } catch {
          return Response.json({ status: 'READY_FOR_CONFIRMATION', urlCandidates: [], selectedUrl: null, snapshot: fallbackSnapshot(raw, '截图中的商品', true), fallback: true });
        }
      }

      // MANUAL — no identification
      return Response.json({ status: 'READY_FOR_CONFIRMATION', urlCandidates: [], selectedUrl: null, snapshot: fallbackSnapshot(raw, '', false), fallback: true });
    }

    // --- FormData path (legacy screenshot upload) ---
    const form = await request.formData();
    const type = String(form.get('type') || 'MANUAL') as 'LINK' | 'SCREENSHOT' | 'MANUAL';
    const raw = String(form.get('raw') || '').trim();
    const hint = String(form.get('hint') || '').trim();
    const imageValue = form.get('image');
    const image = imageValue instanceof File && imageValue.size > 0 ? imageValue : null;

    if (type === 'LINK') {
      const { candidates } = extractUrls(raw);
      if (candidates.length === 0) return fail('未识别到商品链接', 422, 'NO_URL_FOUND');
      if (candidates.length > 1) return Response.json({ status: 'URL_SELECTION_REQUIRED', urlCandidates: candidates });
      const selectedUrl = candidates[0];
      if (!isAiConfigured()) return Response.json({ status: 'READY_FOR_CONFIRMATION', urlCandidates: candidates, selectedUrl, snapshot: fallbackSnapshot(raw, hint, false), fallback: true });
      try {
        const { page } = await identifyLink(selectedUrl);
        const snapshot = await identifyWithAi(selectedUrl, page, undefined, raw, hint);
        return Response.json({ status: 'READY_FOR_CONFIRMATION', urlCandidates: candidates, selectedUrl, snapshot, fallback: false });
      } catch {
        return Response.json({ status: 'READY_FOR_CONFIRMATION', urlCandidates: candidates, selectedUrl, snapshot: fallbackSnapshot(raw, hint, false), fallback: true });
      }
    }

    if (type === 'SCREENSHOT' && image) {
      if (!IMAGE_TYPES.has(image.type) || image.size > MAX_IMAGE_BYTES) return fail('截图仅支持 JPG、PNG、WebP，且不能超过 5MB', 400, 'IMAGE_INVALID');
      if (!isAiConfigured()) return Response.json({ status: 'READY_FOR_CONFIRMATION', urlCandidates: [], selectedUrl: null, snapshot: fallbackSnapshot(raw, hint || '截图中的商品', true), fallback: true });
      try {
        const buf = new Uint8Array(await image.arrayBuffer());
        const snapshot = await identifyWithAi(null, null, { base64: bytesToBase64(buf), mimeType: image.type }, raw, hint);
        return Response.json({ status: 'READY_FOR_CONFIRMATION', urlCandidates: [], selectedUrl: null, snapshot, fallback: false });
      } catch {
        return Response.json({ status: 'READY_FOR_CONFIRMATION', urlCandidates: [], selectedUrl: null, snapshot: fallbackSnapshot(raw, hint || '截图中的商品', true), fallback: true });
      }
    }

    return Response.json({ status: 'READY_FOR_CONFIRMATION', urlCandidates: [], selectedUrl: null, snapshot: fallbackSnapshot(raw, hint, false), fallback: true });
  } catch (error) {
    const status = error instanceof AiAuthorizationError || error instanceof AiServiceError || error instanceof ProductSourceError ? error.status : 500;
    if (status === 401 || status === 403) return fail(error instanceof Error ? error.message : '未授权', status, 'AUTH_REQUIRED');
    return fail(error instanceof Error ? error.message : '商品识别失败', status);
  }
}
