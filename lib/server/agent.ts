import 'server-only';
import type { AgentMessage, AgentReport, AgentSession, EvidenceItem, PurchaseRequest, Review } from '@/lib/types';
import { AiServiceError, generateJson, isAiConfigured } from '@/lib/server/ai/client';

// Spec §7.3 System Prompt
export const AGENT_SYSTEM_PROMPT = `你是 WorthBloom 的 AI 决策顾问，帮助用户把一次重要消费想清楚。

必须：
- 区分 Wish 事实、用户回答、真人反馈与 AI 推断；
- 每轮只问一个能改变判断的问题，总问题不超过 5 个；
- 已有答案不重复追问；信息不足明确写未知；
- 真人反馈必须保留来源 ID 与 revision；
- 最终输出固定 AgentReport Schema。

禁止：
- 替用户选择 Buy Now、Save First 或 Wait；
- 使用"必须买""绝对不该买""这是真需求"等裁决；
- 冒充纳瓦尔或任何真实人物；
- 编造体验、评价、折扣、用户历史或来源；
- 将女性、感性、犹豫等特征推断为不理性；
- 把身体感受、短期痛苦或多数意见当成最终答案。

纳瓦尔原则只能作为内部提问框架：
- 犹豫优先映射为暂时 Wait，不是永久否定；
- 短期痛苦必须与长期收益同时比较；
- 冷静期和直觉只是弱信号。`;

const MAX_QUESTIONS = 5;

export interface AgentContext {
  request: PurchaseRequest;
  reviews: Review[];
}

interface AiTurnResult {
  type: 'question' | 'complete';
  content: string;
  report?: AgentReport;
}

const EMPTY_REPORT: AgentReport = {
  confirmedFacts: [],
  motives: [],
  signalsForPurchase: [],
  signalsForWaiting: [],
  unknowns: [],
  humanConsensus: [],
  humanDisagreements: [],
  nextOptions: ['BUY_NOW', 'SAVE_FIRST', 'WAIT', 'ASK_REVIEWER'],
  disclaimer: '最终决定由用户完成',
};

// Fixed fallback report: only user answers + wish facts + human quotes + unknowns (spec §7.4).
export function fallbackReport(ctx: AgentContext, messages: AgentMessage[]): AgentReport {
  const { request, reviews } = ctx;
  const userAnswers = messages.filter(m => m.role === 'USER' && !m.skipped && m.content);
  return {
    confirmedFacts: [{ id: 'fact-name', text: `心愿：${request.name}，¥${request.price}`, source: 'WISH_FACT', sourceIds: [request.id] }],
    motives: userAnswers.map((m, i) => ({ id: `ans-${i}`, text: m.content, source: 'USER_ANSWER', sourceIds: [m.id] })),
    signalsForPurchase: [],
    signalsForWaiting: [],
    unknowns: [{ id: 'unk-1', text: '信息不足，未能生成 AI 推断', source: 'AI_INFERENCE', sourceIds: [] }],
    humanConsensus: reviews.length ? [{ id: 'hum-1', text: reviews.map(r => r.comment).join('；').slice(0, 300), source: 'HUMAN_REVIEW', sourceIds: reviews.map(r => r.id) }] : [],
    humanDisagreements: [],
    nextOptions: ['BUY_NOW', 'SAVE_FIRST', 'WAIT', 'ASK_REVIEWER'],
    disclaimer: '最终决定由用户完成',
  };
}

function buildTurnPrompt(ctx: AgentContext, messages: AgentMessage[], phase: 'question' | 'complete'): string {
  const { request, reviews } = ctx;
  const wishFacts = { name: request.name, price: request.price, type: request.type, reason: request.reason, concern: request.concern, brand: request.brand };
  const friendReviews = reviews.map(r => ({ id: r.id, revision: r.requestRevision ?? 1, name: r.reviewer_name, choice: r.choice, comment: r.comment }));
  const history = messages.map(m => ({ role: m.role, content: m.content, skipped: m.skipped }));
  if (phase === 'question') {
    const remaining = MAX_QUESTIONS - messages.filter(m => m.role === 'ASSISTANT' && m.questionId).length;
    return `Wish 事实：${JSON.stringify(wishFacts)}\n朋友反馈：${JSON.stringify(friendReviews)}\n对话历史：${JSON.stringify(history)}\n\n还剩 ${Math.max(0, remaining)} 个问题额度。返回 JSON：{"type":"question","content":"下一个问题"} 或 {"type":"complete","content":"准备生成报告"}。只返回合法 JSON。`;
  }
  return `Wish 事实：${JSON.stringify(wishFacts)}\n朋友反馈：${JSON.stringify(friendReviews)}\n对话历史：${JSON.stringify(history)}\n\n现在生成最终报告。严格返回 AgentReport JSON：{"confirmedFacts":[{"id","text","source":"WISH_FACT|USER_ANSWER|HUMAN_REVIEW|AI_INFERENCE","sourceIds":[]}],"motives":[...],"signalsForPurchase":[...],"signalsForWaiting":[...],"unknowns":[...],"humanConsensus":[...],"humanDisagreements":[...],"nextOptions":["BUY_NOW","SAVE_FIRST","WAIT","ASK_REVIEWER"],"disclaimer":"最终决定由用户完成"}。不得替用户选择。`;
}

function normalizeReport(raw: Record<string, unknown>): AgentReport {
  const arr = (v: unknown) => Array.isArray(v) ? v as EvidenceItem[] : [];
  return {
    confirmedFacts: arr(raw.confirmedFacts),
    motives: arr(raw.motives),
    signalsForPurchase: arr(raw.signalsForPurchase),
    signalsForWaiting: arr(raw.signalsForWaiting),
    unknowns: arr(raw.unknowns),
    humanConsensus: arr(raw.humanConsensus),
    humanDisagreements: arr(raw.humanDisagreements),
    nextOptions: Array.isArray(raw.nextOptions) ? raw.nextOptions as AgentReport['nextOptions'] : ['BUY_NOW', 'SAVE_FIRST', 'WAIT', 'ASK_REVIEWER'],
    disclaimer: '最终决定由用户完成',
  };
}

// Ask AI for next turn (question or complete signal).
export async function agentNextQuestion(ctx: AgentContext, messages: AgentMessage[]): Promise<AiTurnResult> {
  if (!isAiConfigured()) throw new AiServiceError('AI 尚未配置', 503);
  const remaining = MAX_QUESTIONS - messages.filter(m => m.role === 'ASSISTANT' && m.questionId).length;
  if (remaining <= 0) return { type: 'complete', content: '已达问题上限，可以生成报告了。' };
  const { data } = await generateJson({ system: AGENT_SYSTEM_PROMPT, prompt: buildTurnPrompt(ctx, messages, 'question'), maxTokens: 400, preferFast: true });
  const type = data.type === 'complete' ? 'complete' : 'question';
  return { type, content: String(data.content ?? '请继续。'), report: undefined };
}

// Ask AI to generate the final report.
export async function agentComplete(ctx: AgentContext, messages: AgentMessage[]): Promise<AgentReport> {
  if (!isAiConfigured()) return fallbackReport(ctx, messages);
  try {
    const { data } = await generateJson({ system: AGENT_SYSTEM_PROMPT, prompt: buildTurnPrompt(ctx, messages, 'complete'), maxTokens: 1200 });
    return normalizeReport(data);
  } catch {
    return fallbackReport(ctx, messages);
  }
}

export const AGENT_MAX_QUESTIONS = MAX_QUESTIONS;
