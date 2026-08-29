// Legacy → spec field compatibility (spec §10.2)
// Old records use category/similar_item/image_url/total_units/usage_frequency/
// expiry_date/product_url/review_token/created_at/review_count/decision_note
// (snake_case). Spec uses type/concern/images/revision/etc. This normalizes
// every read so the rest of the app sees spec-shaped objects. Old fields are
// NOT deleted from storage — they coexist during migration.

import type { Decision, PurchaseRequest, Review, ReviewChoice, ReviewContext, SavingGoal, WishImage, WishType } from './types';

export const CANONICAL_WISH_TYPES = [
  'DURABLE_GOOD',
  'SINGLE_USE',
  'MEMBERSHIP',
  'STORED_VALUE',
  'COURSE_TRAINING',
  'OTHER',
] as const satisfies readonly WishType[];

export type CanonicalWishType = typeof CANONICAL_WISH_TYPES[number];

export const WISH_TYPE_OPTIONS: ReadonlyArray<{ value: CanonicalWishType; label: string }> = [
  { value: 'DURABLE_GOOD', label: '高价值实物' },
  { value: 'SINGLE_USE', label: '一次性体验/消耗品' },
  { value: 'MEMBERSHIP', label: '会员/订阅' },
  { value: 'STORED_VALUE', label: '储值/余额' },
  { value: 'COURSE_TRAINING', label: '课程/次卡' },
  { value: 'OTHER', label: '其他' },
];

const CATEGORY_TO_TYPE: Record<string, WishType> = {
  '训练课程': 'COURSE_TRAINING',
  '课程': 'COURSE_TRAINING',
  '课程/次卡': 'COURSE_TRAINING',
  '课程 / 次卡': 'COURSE_TRAINING',
  '会员服务': 'MEMBERSHIP',
  '会员/订阅': 'MEMBERSHIP',
  '会员 / 订阅': 'MEMBERSHIP',
  '储值卡': 'STORED_VALUE',
  '储值/余额': 'STORED_VALUE',
  '储值卡 / 余额账户': 'STORED_VALUE',
  '会员': 'MEMBERSHIP',
  '储值': 'STORED_VALUE',
  '余额账户': 'STORED_VALUE',
  '实物': 'DURABLE_GOOD',
  '较高价商品': 'DURABLE_GOOD',
  '高价值实物': 'DURABLE_GOOD',
  '耐用品': 'DURABLE_GOOD',
  '一次性消费': 'SINGLE_USE',
  '一次性体验/消耗品': 'SINGLE_USE',
  '单次服务 / 消耗品': 'SINGLE_USE',
  '单次体验': 'SINGLE_USE',
  '旅行体验': 'SINGLE_USE',
  '体验活动': 'SINGLE_USE',
  '活动 / 旅行体验': 'SINGLE_USE',
  '其他': 'OTHER',
};

export function categoryToType(category?: string|null): CanonicalWishType {
  if (!category) return 'OTHER';
  const normalized = category.trim();
  const mapped = CATEGORY_TO_TYPE[normalized];
  if (mapped) return mapped === 'EXPERIENCE' ? 'SINGLE_USE' : mapped as CanonicalWishType;
  if (normalized.includes('课程') || normalized.includes('次卡') || normalized.includes('训练')) return 'COURSE_TRAINING';
  if (normalized.includes('会员') || normalized.includes('订阅')) return 'MEMBERSHIP';
  if (normalized.includes('储值') || normalized.includes('余额')) return 'STORED_VALUE';
  if (normalized.includes('一次性') || normalized.includes('消耗') || normalized.includes('体验') || normalized.includes('活动') || normalized.includes('旅行') || normalized.includes('单次')) return 'SINGLE_USE';
  if (normalized.includes('实物') || normalized.includes('商品') || normalized.includes('耐用')) return 'DURABLE_GOOD';
  return 'OTHER';
}

export function isKnownWishType(value: unknown): value is WishType {
  return typeof value === 'string' && ((CANONICAL_WISH_TYPES as readonly string[]).includes(value) || value === 'EXPERIENCE');
}

export function canonicalWishType(type?: unknown, category?: string|null): CanonicalWishType {
  if (type === 'EXPERIENCE') return 'SINGLE_USE';
  if (typeof type === 'string' && (CANONICAL_WISH_TYPES as readonly string[]).includes(type)) return type as CanonicalWishType;
  return categoryToType(category);
}

export function typeToCategory(type?: WishType|null): string {
  switch (type) {
    case 'DURABLE_GOOD': return '高价值实物';
    case 'SINGLE_USE':
    case 'EXPERIENCE': return '一次性体验/消耗品';
    case 'MEMBERSHIP': return '会员/订阅';
    case 'STORED_VALUE': return '储值/余额';
    case 'COURSE_TRAINING': return '课程/次卡';
    default: return '其他';
  }
}

const LEGACY_DECISIONS: Record<string, ReviewChoice> = {
  BUY_NOW: 'BUY_NOW',
  BUY: 'BUY_NOW',
  PURCHASED: 'BUY_NOW',
  SAVE_FIRST: 'SAVE_FIRST',
  SAVE: 'SAVE_FIRST',
  SAVING: 'SAVE_FIRST',
  WAIT: 'WAIT',
  ARCHIVED: 'WAIT',
  SKIP: 'WAIT',
};

// Decision/saving collections pre-date the camelCase spec fields. Normalize
// both shapes here so old CloudBase documents and local preview state remain
// visible after the UI migration.
export function normalizeDecision(raw: Record<string, unknown>): Decision | null {
  const requestId = raw.request_id ?? raw.requestId ?? raw.wish_id ?? raw.wishId;
  const rawDecision = String(raw.decision ?? raw.choice ?? raw.result ?? '').toUpperCase();
  const decision = LEGACY_DECISIONS[rawDecision];
  if (requestId == null || String(requestId).trim() === '' || !decision) return null;
  return {
    request_id: String(requestId),
    decision,
    decided_at: String(raw.decided_at ?? raw.decidedAt ?? raw.created_at ?? raw.createdAt ?? new Date().toISOString()),
  };
}

function safeMoney(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function normalizeSavingGoal(raw: Record<string, unknown>): SavingGoal {
  const requestId = raw.request_id ?? raw.requestId ?? raw.wish_id ?? raw.wishId;
  const target = safeMoney(raw.target ?? raw.target_amount ?? raw.targetAmount ?? raw.goal_amount ?? raw.goalAmount);
  return {
    id: String(raw.id ?? raw._id ?? `saving-${requestId ?? 'legacy'}`),
    request_id: requestId == null || String(requestId).trim() === '' ? null : String(requestId),
    name: String(raw.name ?? raw.goal_name ?? raw.goalName ?? raw.title ?? raw.product_name ?? raw.productName ?? '未命名的存钱目标'),
    target,
    current: Math.min(target || Number.POSITIVE_INFINITY, safeMoney(raw.current ?? raw.current_amount ?? raw.currentAmount ?? raw.saved ?? raw.saved_amount ?? raw.savedAmount)),
    weekly_plan: raw.weekly_plan == null && raw.weeklyPlan == null ? null : safeMoney(raw.weekly_plan ?? raw.weeklyPlan),
    created_at: String(raw.created_at ?? raw.createdAt ?? new Date().toISOString()),
  };
}

// Normalize a raw Wish record (from any store) into spec shape, filling
// spec fields from legacy fields when spec fields are absent. Does not
// mutate the input.
export function normalizeWish(raw: Record<string, unknown>): PurchaseRequest {
  const legacyCategory = typeof raw.category === 'string' ? raw.category : undefined;
  const type = canonicalWishType(raw.type, legacyCategory);
  const similar = raw.similar_item ?? raw.similarItem;
  const concern = (raw.concern as string|undefined) ?? (typeof similar === 'string' ? similar : '');
  const imageUrl = raw.image_url ?? raw.imageUrl;
  const rawImages = raw.images;
  let images: WishImage[] | undefined;
  if (Array.isArray(rawImages) && rawImages.length) {
    images = rawImages as WishImage[];
  } else if (typeof imageUrl === 'string' && imageUrl) {
    images = [{ id: 'legacy-cover', url: imageUrl, sortOrder: 0, isCover: true }];
  }
  const createdAt = (raw.created_at ?? raw.createdAt) as string|undefined;
  return {
    id: String(raw.id),
    name: String(raw.name ?? ''),
    price: Number(raw.price ?? 0),
    reason: String(raw.reason ?? ''),
    status: (raw.status as PurchaseRequest['status']) ?? 'REVIEWING',
    // legacy passthrough
    category: typeToCategory(type),
    similar_item: typeof similar === 'string' ? similar : null,
    image_url: typeof imageUrl === 'string' ? imageUrl : null,
    // spec
    revision: typeof raw.revision === 'number' ? raw.revision : 1,
    sourceType: (raw.sourceType ?? raw.source_type) as PurchaseRequest['sourceType'] ?? 'MANUAL',
    type,
    concern,
    brand: (raw.brand as string|undefined) ?? '',
    skuLabel: (raw.skuLabel ?? raw.sku_label) as string|undefined ?? '',
    details: (raw.details as string|undefined) ?? '',
    productUrl: (raw.productUrl ?? raw.product_url) as string|undefined ?? null,
    sourcePlatform: (raw.sourcePlatform ?? raw.source_platform) as string|undefined ?? '',
    images: images ?? [],
    total_units: (raw.total_units ?? raw.totalUnits) as number|null|undefined,
    totalUnits: (raw.total_units ?? raw.totalUnits) as number|null|undefined,
    usage_frequency: (raw.usage_frequency ?? raw.usageFrequency) as string|null|undefined,
    usageFrequency: (raw.usage_frequency ?? raw.usageFrequency) as string|null|undefined,
    expiry_date: (raw.expiry_date ?? raw.expiryDate) as string|null|undefined,
    expiryDate: (raw.expiry_date ?? raw.expiryDate) as string|null|undefined,
    review_token: (raw.review_token ?? raw.reviewToken) as string|undefined,
    reviewToken: (raw.review_token ?? raw.reviewToken) as string|undefined,
    created_at: createdAt,
    createdAt,
    updatedAt: (raw.updatedAt ?? raw.updated_at) as string|undefined ?? createdAt,
    review_count: typeof raw.review_count === 'number' ? raw.review_count : (typeof raw.reviewCount === 'number' ? raw.reviewCount : 0),
    reviewCount: typeof raw.review_count === 'number' ? raw.review_count : (typeof raw.reviewCount === 'number' ? raw.reviewCount : 0),
    decision_note: (raw.decision_note ?? raw.decisionNote) as string|undefined,
    decisionNote: (raw.decision_note ?? raw.decisionNote) as string|undefined,
  };
}

// Build a ReviewContext snapshot from a normalized Wish (spec §5.3).
export function buildReviewContext(request: PurchaseRequest): ReviewContext {
  return {
    requestId: request.id,
    requestRevision: request.revision ?? 1,
    wishSnapshot: {
      name: request.name,
      price: request.price,
      type: request.type ?? 'OTHER',
      reason: request.reason,
      concern: request.concern ?? '',
    },
  };
}

// Normalize a raw Review into spec shape.
export function normalizeReview(raw: Record<string, unknown>): Review {
  const hasContext = raw.requestRevision !== undefined || raw.request_revision !== undefined || raw.wishSnapshot !== undefined;
  return {
    id: String(raw.id),
    request_id: String(raw.request_id ?? raw.requestId),
    reviewer_name: String(raw.reviewer_name ?? raw.reviewerName ?? '匿名朋友'),
    choice: (raw.choice ?? raw.stamp) as Review['choice'] ?? 'WAIT',
    comment: String(raw.comment ?? ''),
    created_at: (raw.created_at ?? raw.createdAt) as string|undefined,
    requestRevision: (raw.requestRevision ?? raw.request_revision) as number|undefined,
    wishSnapshot: raw.wishSnapshot as Review['wishSnapshot'],
    reviewerRole: (raw.reviewerRole ?? raw.reviewer_role) as Review['reviewerRole'],
    stamp: (raw.stamp ?? raw.stamp) as Review['stamp'],
    reasons: Array.isArray(raw.reasons) ? raw.reasons as string[] : undefined,
    note: raw.note as string|undefined,
    claimedBy: (raw.claimedBy ?? raw.claimed_by) as string|null|undefined,
    claimedAt: (raw.claimed_at ?? raw.claimedAt) as string|undefined,
    legacyContext: !hasContext ? true : undefined,
  };
}
