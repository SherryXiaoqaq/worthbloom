import 'server-only';
import type { AgentMessage, AgentReport, AgentSession, EvidenceItem, PurchaseRequest, Review } from '@/lib/types';
import { generateJson, isAiConfigured } from '@/lib/server/ai/client';

// Spec §7.3 System Prompt
export const AGENT_SYSTEM_PROMPT = `你是 WorthBloom 的 AI 决策陪谈者，帮助用户把一次重要消费想清楚。

必须：
- 区分 Wish 事实、用户回答、真人反馈与 AI 推断；
- 先用一两句话回应用户刚刚说的内容，再自然地推进对话；
- 每轮最多问一个真正能改变判断的开放式问题，总问题不超过 5 个；
- 问题要结合产品、价格、使用场景、有效期和用户顾虑，避免泛泛地问“你为什么想买”；
- 不提供“买/不买”式选项，不把对话做成问卷；邀请用户用自己的话回答；
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
  const wishFacts = {
    name: request.name,
    price: request.price,
    type: request.type,
    category: request.category,
    reason: request.reason,
    concern: request.concern,
    brand: request.brand,
    details: request.details,
    usageFrequency: request.usageFrequency ?? request.usage_frequency,
    totalUnits: request.totalUnits ?? request.total_units,
    expiryDate: request.expiryDate ?? request.expiry_date,
    productUrl: request.productUrl ?? request.product_url,
  };
  const friendReviews = reviews.map(r => ({ id: r.id, revision: r.requestRevision ?? 1, name: r.reviewer_name, choice: r.choice, comment: r.comment }));
  const history = messages.map(m => ({ role: m.role, content: m.content, skipped: m.skipped }));
  if (phase === 'question') {
    const remaining = MAX_QUESTIONS - messages.filter(m => m.role === 'ASSISTANT' && m.questionId).length;
    return `Wish 事实：${JSON.stringify(wishFacts)}\n朋友反馈：${JSON.stringify(friendReviews)}\n对话历史：${JSON.stringify(history)}\n\n还剩 ${Math.max(0, remaining)} 个问题额度。请根据产品事实、用户顾虑和上一轮回答进行真正的对话：先简短回应上一轮，再问一个开放式、具体且能改变判断的问题；不要使用单选题、不要重复已问内容、不要替用户下结论。用户可以用自己的话回答。返回 JSON：{"type":"question","content":"回应 + 下一个问题"} 或 {"type":"complete","content":"准备生成报告"}。只返回合法 JSON。`;
  }
  return `Wish 事实：${JSON.stringify(wishFacts)}\n朋友反馈：${JSON.stringify(friendReviews)}\n对话历史：${JSON.stringify(history)}\n\n现在生成最终报告。严格返回 AgentReport JSON：{"confirmedFacts":[{"id","text","source":"WISH_FACT|USER_ANSWER|HUMAN_REVIEW|AI_INFERENCE","sourceIds":[]}],"motives":[...],"signalsForPurchase":[...],"signalsForWaiting":[...],"unknowns":[...],"humanConsensus":[...],"humanDisagreements":[...],"nextOptions":["BUY_NOW","SAVE_FIRST","WAIT","ASK_REVIEWER"],"disclaimer":"最终决定由用户完成"}。不得替用户选择。`;
}

export function fallbackQuestion(ctx: AgentContext, messages: AgentMessage[]): string {
  const { request } = ctx;
  const answers = messages.filter(message => message.role === 'USER' && !message.skipped && message.content.trim());
  const latest = answers.at(-1)?.content.trim();
  const questions = [
    `你正在考虑「${request.name}」（¥${request.price.toLocaleString()}）。先不急着决定：你最希望它在生活里的哪个具体时刻帮到你？如果真的拥有它，第一次会怎么用？`,
    `你刚才提到“${latest?.slice(0, 90) || '这个期待'}”。把它放进接下来两周的日程里，你觉得自己会在什么时候、以怎样的频率使用？`,
    `这件事目前最让你顾虑的是“${request.concern || '还没想清楚的地方'}”。如果最后没有买，你会用什么方式满足同一个需要？那个替代方案差在哪里？`,
    `假设买下后只用了几次，最可能卡在哪里？有哪些条件——比如时间、空间、兼容性、有效期或预算——需要先确认？`,
    `现在请分别用一句话写下：你想从它那里得到的体验，以及你愿意为此承担的代价。两句话放在一起看，哪里还需要再想一想？`,
  ];
  return questions[Math.min(answers.length, questions.length - 1)];
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
  if (!isAiConfigured()) return { type: 'question', content: fallbackQuestion(ctx, messages) };
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
