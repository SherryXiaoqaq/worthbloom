import type { PurchaseAdvice, PurchaseHabitProfile } from '@/lib/ai-types';
import type { PurchaseRequest, Review, ReviewChoice } from '@/lib/types';
import { AiAuthorizationError, authorizeAiRequest } from '@/lib/server/ai/authorize';
import { AiServiceError, generateJson } from '@/lib/server/ai/client';

export const dynamic = 'force-dynamic';

function stringArray(value: unknown, maxItems: number) {
  return Array.isArray(value)
    ? value.filter(item => typeof item === 'string' && item.trim()).slice(0, maxItems).map(item => String(item).trim().slice(0, 220))
    : [];
}

function normalizeAdvice(raw: Record<string, unknown>, hasReviews: boolean): PurchaseAdvice {
  const allowed: ReviewChoice[] = ['BUY_NOW', 'SAVE_FIRST', 'WAIT'];
  const recommendation = allowed.includes(raw.recommendation as ReviewChoice) ? raw.recommendation as ReviewChoice : 'SAVE_FIRST';
  const confidence = Number(raw.confidence);
  return {
    recommendation,
    headline: typeof raw.headline === 'string' ? raw.headline.trim().slice(0, 80) : '把信息放在一起，再听听自己',
    summary: typeof raw.summary === 'string' ? raw.summary.trim().slice(0, 500) : 'AI 已整理朋友反馈与购买理由。',
    friend_consensus: hasReviews
      ? (typeof raw.friend_consensus === 'string' ? raw.friend_consensus.trim().slice(0, 300) : '朋友意见没有形成明确共识。')
      : '暂无朋友评价，本次建议只参考你的购买需求、商品信息和过往使用记录。',
    considerations: stringArray(raw.considerations, 5),
    questions: stringArray(raw.questions, 3),
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5,
  };
}

function nonNegativeNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function ratioOrNull(value: unknown) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : null;
}

function safeCounts(value: unknown, allowedKeys: string[]) {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return Object.fromEntries(allowedKeys.map(key => [key, nonNegativeNumber(source[key])]));
}

export async function POST(request: Request) {
  try {
    await authorizeAiRequest(request);
    const body = await request.json() as { request?: Partial<PurchaseRequest>; reviews?: Partial<Review>[]; decisionNote?: string; purchaseProfile?: Partial<PurchaseHabitProfile> };
    const wish = body.request;
    if (!wish?.name || typeof wish.reason !== 'string') return Response.json({ error: '缺少心愿信息' }, { status: 400 });
    const reviews = Array.isArray(body.reviews) ? body.reviews.slice(0, 30) : [];
    const profile = body.purchaseProfile || {};

    const safeInput = {
      wish: {
        name: String(wish.name).slice(0, 120),
        price: Number(wish.price) || 0,
        reason: String(wish.reason).slice(0, 1200),
        category: String(wish.category || '').slice(0, 40),
        total_units: wish.total_units ?? null,
        usage_frequency: wish.usage_frequency || null,
        expiry_date: wish.expiry_date || null,
        similar_item: wish.similar_item || null,
      },
      owner_note: String(body.decisionNote || '').slice(0, 1200),
      purchase_habits: {
        tracked_asset_count: nonNegativeNumber(profile.tracked_asset_count),
        tracked_spend: nonNegativeNumber(profile.tracked_spend),
        asset_type_counts: safeCounts(profile.asset_type_counts, ['COURSE', 'MEMBERSHIP', 'STORED_VALUE', 'ITEM']),
        usage_events: nonNegativeNumber(profile.usage_events),
        consumable_utilization: ratioOrNull(profile.consumable_utilization),
        active_saving_count: nonNegativeNumber(profile.active_saving_count),
        average_saving_progress: ratioOrNull(profile.average_saving_progress),
        prior_wish_status_counts: safeCounts(profile.prior_wish_status_counts, ['REVIEWING', 'SAVING', 'PURCHASED', 'ARCHIVED']),
      },
      friend_reviews: reviews.map(review => ({
        nickname: String(review.reviewer_name || '朋友').slice(0, 20),
        choice: review.choice,
        reason: String(review.comment || '').slice(0, 500),
      })),
    };
    const expected = {
      recommendation: 'BUY_NOW / SAVE_FIRST / WAIT 三选一',
      headline: '一句克制的结论',
      summary: '综合说明，不超过120字',
      friend_consensus: reviews.length ? '朋友意见的共识与分歧' : '明确说明本次没有朋友评价',
      considerations: ['最值得权衡的事实，2到4条'],
      questions: ['用户最终决定前可以问自己的问题，1到2条'],
      confidence: '0到1之间的数字',
    };
    const { data, meta } = await generateJson({
      system: '你是 WorthBloom 的消费决策助手。根据用户购买理由、商品价格、匿名购买习惯摘要进行克制判断；如有朋友意见再综合，没有朋友意见也必须独立给出建议。重点判断是否可能被实际使用、是否与既有物资重复、是否更适合先储蓄。你的输出只是建议，不能替用户决定。没有收入、预算或负债信息时不得假设。只返回合法 JSON。',
      prompt: `请快速分析以下心愿：\n${JSON.stringify(safeInput)}\n\n严格返回以下精简 JSON：${JSON.stringify(expected)}`,
      maxTokens: 700,
      preferFast: true,
    });
    return Response.json({ advice: normalizeAdvice(data, reviews.length > 0), meta });
  } catch (error) {
    const status = error instanceof AiAuthorizationError || error instanceof AiServiceError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : 'AI 建议生成失败' }, { status });
  }
}
