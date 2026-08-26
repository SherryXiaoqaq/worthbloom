// Legacy → spec field compatibility (spec §10.2)
// Old records use category/similar_item/image_url/total_units/usage_frequency/
// expiry_date/product_url/review_token/created_at/review_count/decision_note
// (snake_case). Spec uses type/concern/images/revision/etc. This normalizes
// every read so the rest of the app sees spec-shaped objects. Old fields are
// NOT deleted from storage — they coexist during migration.

import type { PurchaseRequest, Review, ReviewContext, WishImage, WishType } from './types';

const CATEGORY_TO_TYPE: Record<string, WishType> = {
  '训练课程': 'COURSE_TRAINING',
  '课程': 'COURSE_TRAINING',
  '会员服务': 'MEMBERSHIP',
  '会员': 'MEMBERSHIP',
  '储值': 'MEMBERSHIP',
  '实物': 'DURABLE_GOOD',
  '较高价商品': 'DURABLE_GOOD',
  '旅行体验': 'EXPERIENCE',
  '体验活动': 'EXPERIENCE',
  '其他': 'OTHER',
};

export function categoryToType(category?: string|null): WishType {
  if (!category) return 'OTHER';
  return CATEGORY_TO_TYPE[category] ?? 'OTHER';
}

export function typeToCategory(type?: WishType|null): string {
  switch (type) {
    case 'COURSE_TRAINING': return '训练课程';
    case 'DURABLE_GOOD': return '较高价商品';
    case 'SINGLE_USE': return '实物';
    case 'MEMBERSHIP': return '会员服务';
    case 'EXPERIENCE': return '旅行体验';
    default: return '其他';
  }
}

// Normalize a raw Wish record (from any store) into spec shape, filling
// spec fields from legacy fields when spec fields are absent. Does not
// mutate the input.
export function normalizeWish(raw: Record<string, unknown>): PurchaseRequest {
  const legacyCategory = typeof raw.category === 'string' ? raw.category : undefined;
  const type = (raw.type as WishType|undefined) ?? categoryToType(legacyCategory);
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
    category: legacyCategory,
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
