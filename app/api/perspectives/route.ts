import type { PerspectiveItem, PerspectiveSummary, ReviewChoice } from '@/lib/types';
import { AiAuthorizationError, authorizeAiRequest } from '@/lib/server/ai/authorize';
import { AiServiceError, generateJson, isAiConfigured } from '@/lib/server/ai/client';

export const dynamic = 'force-dynamic';

type AdviceInput = { mode:'SOLO'|'SUMMARY'; name:string; price:number; reason:string; concern?:string; reviews?:Array<{id:string;comment:string}> };

function fallbackPerspectives(input:AdviceInput):PerspectiveSummary {
  if (input.mode === 'SUMMARY' && input.reviews?.length) {
    const ids = input.reviews.map(r => r.id);
    return {
      consensus: [{ id:'sum-1', title:'共同关注', content:'大家都在关心这件东西能否真正进入你的日常，而不只是购买当下的喜欢。', source_type:'HUMAN', source_ids:ids }],
      disagreements: [{ id:'sum-2', title:'分歧仍然存在', content:'有人更看重现在的心愿，也有人希望先确认预算和使用条件。', source_type:'HUMAN', source_ids:ids }],
      risks: [{ id:'sum-3', title:'现实条件', content:'使用频率和持续投入仍需要你自己确认。', source_type:'AI', source_ids:[] }],
      unknowns: [{ id:'sum-4', title:'还没有答案', content:'如果热情下降，你是否仍然愿意为它安排固定时间？', source_type:'AI', source_ids:[] }],
      fallback: true,
    };
  }
  return {
    consensus: [{ id:'solo-fit', title:'个人适配', content:`你真正想买的可能不只是"${input.name}"，而是它代表的那种生活。先确认这个生活场景是否已经在日程里有位置。`, source_type:'AI', source_ids:[] }],
    disagreements: [{ id:'solo-real', title:'现实可行性', content:`¥${input.price.toLocaleString()} 的压力不只来自金额，也来自后续使用所需的时间和精力。`, source_type:'AI', source_ids:[] }],
    risks: [{ id:'solo-counter', title:'反方提醒', content:`如果暂时不买，你失去的是什么？如果答案只是优惠或稀缺感，可以先把决定放回自己手里。`, source_type:'AI', source_ids:[] }],
    unknowns: [{ id:'solo-unknown', title:'待确认', content:input.concern || '你能否说出下周第一次使用它的具体时间？', source_type:'AI', source_ids:[] }],
    fallback: true,
  };
}

function stringArray(value: unknown, maxItems: number) {
  return Array.isArray(value)
    ? value.filter(item => typeof item === 'string' && item.trim()).slice(0, maxItems).map(item => String(item).trim().slice(0, 220))
    : [];
}

function mapAdvice(raw: Record<string, unknown>, reviews: Array<{id:string;comment:string}>):PerspectiveSummary {
  const allowed:ReviewChoice[] = ['BUY_NOW','SAVE_FIRST','WAIT'];
  const recommendation = allowed.includes(raw.recommendation as ReviewChoice) ? raw.recommendation as ReviewChoice : 'SAVE_FIRST';
  const headline = typeof raw.headline === 'string' ? raw.headline.trim().slice(0, 80) : '把信息放在一起，再听听自己';
  const summary = typeof raw.summary === 'string' ? raw.summary.trim().slice(0, 500) : 'AI 已整理朋友反馈与购买理由。';
  const friendConsensus = reviews.length
    ? (typeof raw.friend_consensus === 'string' ? raw.friend_consensus.trim().slice(0, 300) : '朋友意见没有形成明确共识。')
    : '暂无朋友评价，本次建议只参考你的购买需求与商品信息。';
  const considerations = stringArray(raw.considerations, 5);
  const questions = stringArray(raw.questions, 3);

  const consensus: PerspectiveItem[] = [
    { id:'c1', title:headline, content:summary, source_type:'AI', source_ids:[] },
  ];
  if (reviews.length) consensus.push({ id:'c2', title:'朋友共识', content:friendConsensus, source_type:'HUMAN', source_ids:reviews.map(r => r.id) });

  return {
    consensus,
    disagreements: considerations.slice(0, 2).map((c, i) => ({ id:`d${i}`, title:'权衡点', content:c, source_type:'AI' as const, source_ids:[] })),
    risks: considerations.slice(2).map((c, i) => ({ id:`r${i}`, title:'风险提醒', content:c, source_type:'AI' as const, source_ids:[] })),
    unknowns: questions.map((q, i) => ({ id:`u${i}`, title:'待确认', content:q, source_type:'AI' as const, source_ids:[] })),
    fallback: false,
  };
}

export async function POST(request: Request) {
  try {
    await authorizeAiRequest(request);
    const input = await request.json() as AdviceInput;
    if (!input?.name || typeof input.reason !== 'string') {
      return Response.json({ error: '缺少心愿信息' }, { status: 400 });
    }
    const reviews = Array.isArray(input.reviews) ? input.reviews.slice(0, 30) : [];

    if (!isAiConfigured()) {
      return Response.json(fallbackPerspectives(input));
    }

    const safeInput = {
      wish: {
        name: String(input.name).slice(0, 120),
        price: Number(input.price) || 0,
        reason: String(input.reason).slice(0, 1200),
        category: '',
        total_units: null,
        usage_frequency: null,
        expiry_date: null,
        similar_item: input.concern || null,
      },
      owner_note: '',
      purchase_habits: {
        tracked_asset_count: 0, tracked_spend: 0, asset_type_counts: {},
        usage_events: 0, consumable_utilization: null, active_saving_count: 0,
        average_saving_progress: null, prior_wish_status_counts: {},
      },
      friend_reviews: reviews.map(review => ({ nickname:'朋友', choice:null, reason: String(review.comment || '').slice(0, 500) })),
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
    const { data } = await generateJson({
      system: '你是 WorthBloom 的消费决策助手。根据用户购买理由、商品价格进行克制判断；如有朋友意见再综合，没有朋友意见也必须独立给出建议。重点判断是否可能被实际使用、是否更适合先储蓄。你的输出只是建议，不能替用户决定。只返回合法 JSON。',
      prompt: `请快速分析以下心愿：\n${JSON.stringify(safeInput)}\n\n严格返回以下精简 JSON：${JSON.stringify(expected)}`,
      maxTokens: 700,
      preferFast: true,
    });
    return Response.json(mapAdvice(data, reviews));
  } catch (error) {
    const status = error instanceof AiAuthorizationError || error instanceof AiServiceError ? error.status : 500;
    if (status === 401 || status === 403) {
      return Response.json({ error: error instanceof Error ? error.message : '未授权' }, { status });
    }
    try {
      const input = await request.clone().json() as AdviceInput;
      return Response.json(fallbackPerspectives(input));
    } catch {
      return Response.json({ error: error instanceof Error ? error.message : 'AI 暂时不可用' }, { status: 500 });
    }
  }
}
