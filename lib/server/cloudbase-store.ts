import 'server-only';

import type { AppData, Asset, AssetReflection, Decision, GrowthAccount, GrowthLedgerEntry, InboxPage, PurchaseRequest, Review, ReviewChoice, ReviewInvite, SavingGoal, UserProfile } from '@/lib/types';
import { applyAssetUsage, assetTypeForWish, AssetRuleError, costPerUse, normalizeAssetReflection, parseAssetPayload, parseAssetReflectionPayload } from '@/lib/asset-rules';
import { getCloudBaseDb } from './cloudbase-http-db';
import { canonicalWishType, isKnownWishType, normalizeDecision, normalizeSavingGoal, normalizeWish, normalizeReview, buildReviewContext, typeToCategory } from '@/lib/wish-compat';
import { digestClaimToken } from './claim-token';

type CloudDocument = Record<string, unknown> & { _id?: string; id?: string; owner_id?: string };
type ActionBody = Record<string, unknown>;

const collections = {
  requests: 'purchase_requests',
  reviews: 'reviews',
  invites: 'review_invites',
  decisions: 'final_decisions',
  saving: 'saving_goals',
  assets: 'assets',
  usage: 'usage_records',
  reflections: 'asset_reflections',
  wishImages: 'wish_images',
  claimTokens: 'claim_tokens',
  growth: 'growth_accounts',
  growthLedger: 'growth_ledger',
  agentSessions: 'agent_sessions',
  agentMessages: 'agent_messages',
  agentReports: 'agent_reports',
  profiles: 'user_profiles',
  inboxStates: 'inbox_states',
} as const;
const now = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);
const inviteToken = () => crypto.randomUUID().replaceAll('-', '').slice(0, 20);

export class CloudBaseStoreError extends Error {
  code?: string;
  constructor(message: string, public status = 400, code?: string) {
    super(message);
    this.code = code;
  }
}

function cleanDocument(document: CloudDocument) {
  const rest = { ...document };
  delete rest._id;
  delete rest.owner_id;
  return { ...rest, id: String(document.id || document._id || '') };
}

function newestFirst<T>(items: T[]) {
  const createdAt = (item: T) => String((item as { created_at?: string }).created_at || '');
  return items.sort((left, right) => createdAt(right).localeCompare(createdAt(left)));
}

async function ownerDocuments(collection: string, ownerId: string) {
  const result = await getCloudBaseDb().collection(collection).where({ owner_id: ownerId }).limit(100).get();
  return (result.data || []) as CloudDocument[];
}

async function ownedDocument(collection: string, documentId: string, ownerId: string) {
  const result = await getCloudBaseDb().collection(collection).doc(documentId).get();
  const document = (result.data || [])[0] as CloudDocument | undefined;
  if (!document || document.owner_id !== ownerId) return null;
  return document;
}

async function saveDocument(collection: string, id: string, data: Record<string, unknown>) {
  await getCloudBaseDb().collection(collection).doc(id).set({ ...data, id });
}

function levelForPoints(points: number): 1 | 2 | 3 | 4 {
  if (points >= 700) return 4;
  if (points >= 300) return 3;
  if (points >= 100) return 2;
  return 1;
}

function nextLevelPoints(level: 1 | 2 | 3 | 4) {
  return level === 1 ? 100 : level === 2 ? 300 : level === 3 ? 700 : undefined;
}

function profileFromDocument(ownerId: string, document: CloudDocument | undefined, fallbackNickname?: string | null): UserProfile {
  const createdAt = String(document?.created_at || now());
  return {
    userId: ownerId,
    nickname: String(document?.nickname || fallbackNickname || '好好花用户').slice(0, 20),
    avatarUrl: document?.avatar_url ? String(document.avatar_url) : undefined,
    bio: document?.bio ? String(document.bio) : '',
    shareIdentityDefault: document?.share_identity_default === 'NICKNAME' ? 'NICKNAME' : 'ANONYMOUS',
    createdAt,
    updatedAt: String(document?.updated_at || createdAt),
  };
}

async function awardCloudBaseGrowth(ownerId: string, actionType: string, referenceId: string, delta: number) {
  const db = getCloudBaseDb();
  const idempotencyKey = `${actionType}:${referenceId}`;
  const entries = await ownerDocuments(collections.growthLedger, ownerId);
  if (entries.some(entry => entry.idempotency_key === idempotencyKey)) return;
  const accountDocument = (await db.collection(collections.growth).doc(ownerId).get()).data?.[0] as CloudDocument | undefined;
  const points = Number(accountDocument?.points ?? 0) + delta;
  const level = levelForPoints(points);
  await saveDocument(collections.growth, ownerId, { owner_id: ownerId, user_id: ownerId, points, level, updated_at: now() });
  await saveDocument(collections.growthLedger, crypto.randomUUID(), {
    owner_id: ownerId,
    user_id: ownerId,
    action_type: actionType,
    reference_id: referenceId,
    points: delta,
    idempotency_key: idempotencyKey,
    limited: false,
    created_at: now(),
  });
}

export async function loadCloudBaseProfile(ownerId: string, fallbackNickname?: string | null) {
  const document = (await getCloudBaseDb().collection(collections.profiles).doc(ownerId).get()).data?.[0] as CloudDocument | undefined;
  return profileFromDocument(ownerId, document, fallbackNickname);
}

export async function saveCloudBaseProfile(ownerId: string, patch: Partial<UserProfile>, fallbackNickname?: string | null) {
  const existing = (await getCloudBaseDb().collection(collections.profiles).doc(ownerId).get()).data?.[0] as CloudDocument | undefined;
  const current = profileFromDocument(ownerId, existing, fallbackNickname);
  const nickname = patch.nickname === undefined ? current.nickname : String(patch.nickname).trim().slice(0, 20);
  const bio = patch.bio === undefined ? current.bio || '' : String(patch.bio).trim().slice(0, 80);
  const shareIdentityDefault = patch.shareIdentityDefault === undefined ? current.shareIdentityDefault : patch.shareIdentityDefault;
  if (!nickname) throw new CloudBaseStoreError('请填写昵称', 400, 'nickname');
  if (!['ANONYMOUS', 'NICKNAME'].includes(shareIdentityDefault)) throw new CloudBaseStoreError('分享身份设置无效', 400, 'shareIdentityDefault');
  const createdAt = current.createdAt;
  const updatedAt = now();
  await saveDocument(collections.profiles, ownerId, {
    owner_id: ownerId,
    user_id: ownerId,
    nickname,
    avatar_url: current.avatarUrl || null,
    bio,
    share_identity_default: shareIdentityDefault,
    created_at: createdAt,
    updated_at: updatedAt,
  });
  if (nickname && bio) await awardCloudBaseGrowth(ownerId, 'profile_completed', ownerId, 10);
  return { ...current, nickname, bio, shareIdentityDefault, updatedAt };
}

export async function saveCloudBaseAvatar(ownerId: string, avatarUrl: string | null, fallbackNickname?: string | null) {
  const existing = (await getCloudBaseDb().collection(collections.profiles).doc(ownerId).get()).data?.[0] as CloudDocument | undefined;
  const current = profileFromDocument(ownerId, existing, fallbackNickname);
  const updatedAt = now();
  await saveDocument(collections.profiles, ownerId, {
    owner_id: ownerId,
    user_id: ownerId,
    nickname: current.nickname,
    avatar_url: avatarUrl,
    bio: current.bio || '',
    share_identity_default: current.shareIdentityDefault,
    created_at: current.createdAt,
    updated_at: updatedAt,
  });
  return { ...current, avatarUrl: avatarUrl || undefined, updatedAt };
}

export async function loadCloudBaseGrowth(ownerId: string) {
  const [accountDocument, ledgerDocuments] = await Promise.all([
    getCloudBaseDb().collection(collections.growth).doc(ownerId).get(),
    getCloudBaseDb().collection(collections.growthLedger).where({ user_id: ownerId }).limit(100).get(),
  ]);
  const rawAccount = accountDocument.data?.[0] as CloudDocument | undefined;
  const points = Number(rawAccount?.points ?? 0);
  const level = levelForPoints(points);
  const account: GrowthAccount = { userId: ownerId, points, level, nextLevelPoints: nextLevelPoints(level), updatedAt: rawAccount?.updated_at ? String(rawAccount.updated_at) : undefined };
  const entries: GrowthLedgerEntry[] = newestFirst((ledgerDocuments.data || []) as CloudDocument[]).map(document => ({
    id: String(document.id || document._id || ''),
    userId: ownerId,
    actionType: String(document.action_type || document.reason || 'growth'),
    referenceId: String(document.reference_id || ''),
    delta: Number(document.points ?? 0),
    idempotencyKey: String(document.idempotency_key || ''),
    limited: Boolean(document.limited),
    createdAt: String(document.created_at || now()),
  }));
  return { account, entries };
}

export async function loadCloudBaseInbox(ownerId: string, cursor = '0', limit = 20): Promise<InboxPage> {
  const [reviewDocuments, requestDocuments, stateDocument] = await Promise.all([
    ownerDocuments(collections.reviews, ownerId),
    ownerDocuments(collections.requests, ownerId),
    getCloudBaseDb().collection(collections.inboxStates).doc(ownerId).get(),
  ]);
  const readState = stateDocument.data?.[0] as CloudDocument | undefined;
  const readIds = new Set(Array.isArray(readState?.read_review_ids) ? readState.read_review_ids.map(String) : []);
  const requestNames = new Map(requestDocuments.map(document => [String(document.id || document._id || ''), String(document.name || '已归档心愿')]));
  const reviews = newestFirst(reviewDocuments).map(document => normalizeReview(cleanDocument(document) as unknown as Record<string, unknown>));
  const offset = Math.max(0, Number.parseInt(cursor, 10) || 0);
  const safeLimit = Math.max(1, Math.min(50, limit));
  const page = reviews.slice(offset, offset + safeLimit);
  return {
    items: page.map(review => ({ review, requestName: requestNames.get(review.request_id) || '已归档心愿', isRead: readIds.has(review.id) })),
    nextCursor: offset + safeLimit < reviews.length ? String(offset + safeLimit) : null,
    unreadCount: reviews.filter(review => !readIds.has(review.id)).length,
  };
}

export async function markCloudBaseInboxRead(ownerId: string, reviewIds: string[]) {
  const db = getCloudBaseDb();
  const ownedReviews = await ownerDocuments(collections.reviews, ownerId);
  const allowed = new Set(ownedReviews.map(document => String(document.id || document._id || '')));
  const stateDocument = (await db.collection(collections.inboxStates).doc(ownerId).get()).data?.[0] as CloudDocument | undefined;
  const existing = Array.isArray(stateDocument?.read_review_ids) ? stateDocument.read_review_ids.map(String) : [];
  const merged = [...new Set([...existing, ...reviewIds.filter(id => allowed.has(id))])].slice(-1000);
  await saveDocument(collections.inboxStates, ownerId, { owner_id: ownerId, user_id: ownerId, read_review_ids: merged, updated_at: now() });
  return { ok: true, readReviewIds: merged };
}

export async function loadCloudBaseData(ownerId: string): Promise<AppData> {
  const [requestDocuments, reviewDocuments, inviteDocuments, savingDocuments, assetDocuments, decisionDocuments, reflectionDocuments] = await Promise.all([
    ownerDocuments(collections.requests, ownerId),
    ownerDocuments(collections.reviews, ownerId),
    ownerDocuments(collections.invites, ownerId),
    ownerDocuments(collections.saving, ownerId),
    ownerDocuments(collections.assets, ownerId),
    ownerDocuments(collections.decisions, ownerId),
    ownerDocuments(collections.reflections, ownerId),
  ]);

  const reviewCounts = new Map<string, number>();
  for (const review of reviewDocuments) {
    const requestId = String(review.request_id || '');
    reviewCounts.set(requestId, (reviewCounts.get(requestId) || 0) + 1);
  }

  // Wish images are stored as one doc per request: { request_id, images[], ... }
  const imageDocs = await ownerDocuments(collections.wishImages, ownerId);
  const imagesByRequest = new Map<string, unknown[]>();
  for (const doc of imageDocs) {
    if (Array.isArray(doc.images)) imagesByRequest.set(String(doc.request_id), doc.images as unknown[]);
  }

  const requests = newestFirst(requestDocuments.map(document => {
    const cleaned = cleanDocument(document) as unknown as Record<string, unknown>;
    const rid = String(document.id || document._id || '');
    cleaned.review_count = reviewCounts.get(rid) || 0;
    cleaned.images = imagesByRequest.get(rid) ?? [];
    return normalizeWish(cleaned);
  })) as unknown as PurchaseRequest[];

  return {
    requests,
    reviews: newestFirst(reviewDocuments.map(doc => normalizeReview(cleanDocument(doc) as unknown as Record<string, unknown>))) as unknown as Review[],
    invites: newestFirst(inviteDocuments.map(cleanDocument)) as unknown as ReviewInvite[],
    decisions: newestFirst(decisionDocuments.map(cleanDocument).map(document => normalizeDecision(document as Record<string, unknown>)).filter((decision): decision is Decision => decision !== null)),
    savingGoals: newestFirst(savingDocuments.map(cleanDocument).map(document => normalizeSavingGoal(document as Record<string, unknown>))),
    assets: newestFirst(assetDocuments.map(document => {
      const asset=cleanDocument(document) as unknown as Asset;
      return {...asset,archived_at:asset.archived_at??null};
    })),
    assetReflections: newestFirst(reflectionDocuments.map(document => normalizeAssetReflection(cleanDocument(document) as unknown as AssetReflection))),
  };
}

export async function handleCloudBaseDataAction(ownerId: string, body: ActionBody) {
  const db = getCloudBaseDb();

  if (body.action === 'create_request') {
    const payload = body.payload as Record<string, unknown>;
    const name = String(payload.name ?? '').trim().slice(0, 80);
    const reason = String(payload.reason ?? '').trim().slice(0, 500);
    const price = Number(payload.price);
    const concern = String(payload.concern ?? payload.similar_item ?? '').trim().slice(0, 200);
    const suppliedType = String(payload.type ?? '').trim();
    const legacyCategory = String(payload.category ?? '').trim();
    if (!name) throw new CloudBaseStoreError('请填写商品或课程名称', 400, 'name');
    if (!reason) throw new CloudBaseStoreError('请填写你为什么想要它', 400, 'reason');
    if (!Number.isFinite(price) || price < 0 || price > 99_999_999.99) throw new CloudBaseStoreError('请填写有效价格', 400, 'price');
    if (!concern) throw new CloudBaseStoreError('请填写或选择你最担心的问题', 400, 'concern');
    if ((!suppliedType && !legacyCategory) || (suppliedType && !isKnownWishType(suppliedType))) throw new CloudBaseStoreError('请选择类型', 400, 'type');
    const typeRaw = canonicalWishType(suppliedType, legacyCategory);

    const id = crypto.randomUUID();
    const createdAt = now();
    const images = Array.isArray(payload.images) ? (payload.images as Array<Record<string, unknown>>).slice(0, 6).map((img, index) => ({ id: String(img.id ?? crypto.randomUUID()), url: String(img.url ?? ''), sortOrder: Number(img.sortOrder ?? index), isCover: Boolean(img.isCover) })) : [];
    if (images.length && !images.some(img => img.isCover)) images[0].isCover = true;
    const request: PurchaseRequest = {
      id, name, price, reason,
      category: typeToCategory(typeRaw),
      total_units: payload.total_units == null && payload.totalUnits == null ? null : Number(payload.total_units ?? payload.totalUnits),
      usage_frequency: payload.usage_frequency ? String(payload.usage_frequency) : payload.usageFrequency ? String(payload.usageFrequency) : null,
      expiry_date: payload.expiry_date ? String(payload.expiry_date) : payload.expiryDate ? String(payload.expiryDate) : null,
      product_url: payload.product_url ? String(payload.product_url) : payload.productUrl ? String(payload.productUrl) : null,
      similar_item: concern,
      status: 'REVIEWING',
      review_token: inviteToken(),
      created_at: createdAt,
      updatedAt: createdAt,
      review_count: 0,
      revision: 1,
      sourceType: (payload.source_type ?? payload.sourceType ?? 'MANUAL') as PurchaseRequest['sourceType'],
      type: typeRaw,
      concern,
      brand: String(payload.brand ?? '').slice(0, 80),
      skuLabel: String(payload.sku_label ?? payload.skuLabel ?? '').slice(0, 120),
      details: String(payload.details ?? '').slice(0, 2000),
      sourcePlatform: String(payload.source_platform ?? payload.sourcePlatform ?? '').slice(0, 40),
      productUrl: payload.product_url ? String(payload.product_url) : payload.productUrl ? String(payload.productUrl) : null,
      images,
    };
    await saveDocument(collections.requests, id, { ...request, owner_id: ownerId });
    if (images.length) await saveDocument(collections.wishImages, `${id}-images`, { owner_id: ownerId, request_id: id, images, updated_at: createdAt });

    const invites: ReviewInvite[] = [1, 2, 3].map(index => ({
      id: crypto.randomUUID(), request_id: id, token: inviteToken(), label: `朋友 ${index}`,
      used_by: null, used_at: null, revoked: 0, created_at: now(),
    }));
    await Promise.all(invites.map(invite => saveDocument(collections.invites, invite.id, { ...invite, owner_id: ownerId })));
    return { request: normalizeWish(request as unknown as Record<string, unknown>), invites };
  }

  if (body.action === 'update_request') {
    const requestId = String(body.requestId ?? '');
    const expected = Number(body.expectedRevision);
    const request = await ownedDocument(collections.requests, requestId, ownerId);
    if (!request) throw new CloudBaseStoreError('没有找到这个心愿', 404, 'requestId');
    if (request.status !== 'REVIEWING') throw new CloudBaseStoreError('这个决定已经保存，可以复制为新心愿后继续调整。', 409, 'REQUEST_READ_ONLY');
    const currentRev = Number(request.revision ?? 1);
    if (!Number.isFinite(expected) || expected !== currentRev) throw new CloudBaseStoreError('心愿已在其他页面更新，请刷新后重试。', 409, 'REVISION_CONFLICT');
    const payload = body.payload as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if (typeof payload.name === 'string') patch.name = payload.name.trim().slice(0, 80);
    if (typeof payload.price === 'number') patch.price = payload.price;
    if (typeof payload.reason === 'string') patch.reason = payload.reason.trim().slice(0, 500);
    if (typeof payload.concern === 'string') { patch.concern = payload.concern.trim().slice(0, 200); patch.similar_item = patch.concern; }
    if (typeof payload.type === 'string') {
      if (!isKnownWishType(payload.type)) throw new CloudBaseStoreError('请选择类型', 400, 'type');
      patch.type = canonicalWishType(payload.type);
      patch.category = typeToCategory(patch.type as PurchaseRequest['type']);
    } else if (typeof payload.category === 'string') {
      patch.type = canonicalWishType(undefined, payload.category);
      patch.category = typeToCategory(patch.type as PurchaseRequest['type']);
    }
    if (typeof payload.brand === 'string') patch.brand = payload.brand.slice(0, 80);
    if (payload.skuLabel !== undefined || payload.sku_label !== undefined) patch.skuLabel = String(payload.skuLabel ?? payload.sku_label).slice(0, 120);
    if (typeof payload.details === 'string') patch.details = payload.details.slice(0, 2000);
    if (payload.productUrl !== undefined || payload.product_url !== undefined) patch.productUrl = payload.productUrl ?? payload.product_url;
    if (payload.sourcePlatform !== undefined || payload.source_platform !== undefined) patch.sourcePlatform = String(payload.sourcePlatform ?? payload.source_platform).slice(0, 40);
    if (payload.totalUnits !== undefined || payload.total_units !== undefined) patch.total_units = payload.totalUnits ?? payload.total_units;
    if (payload.usageFrequency !== undefined || payload.usage_frequency !== undefined) patch.usage_frequency = payload.usageFrequency ?? payload.usage_frequency;
    if (payload.expiryDate !== undefined || payload.expiry_date !== undefined) patch.expiry_date = payload.expiryDate ?? payload.expiry_date;
    if (Array.isArray(payload.images)) {
      const images = (payload.images as Array<Record<string, unknown>>).slice(0, 6).map((img, index) => ({ id: String(img.id ?? crypto.randomUUID()), url: String(img.url ?? ''), sortOrder: Number(img.sortOrder ?? index), isCover: Boolean(img.isCover) }));
      if (images.length && !images.some(img => img.isCover)) images[0].isCover = true;
      patch.images = images;
      await saveDocument(collections.wishImages, `${requestId}-images`, { owner_id: ownerId, request_id: requestId, images, updated_at: now() });
    }
    const nextName=String(patch.name??request.name??'').trim();
    const nextReason=String(patch.reason??request.reason??'').trim();
    const nextPrice=Number(patch.price??request.price);
    const nextConcern=String(patch.concern??request.concern??request.similar_item??'').trim();
    const nextType=String(patch.type??request.type??'');
    if(!nextName)throw new CloudBaseStoreError('请填写商品或课程名称',400,'name');
    if(!nextReason)throw new CloudBaseStoreError('请填写你为什么想要它',400,'reason');
    if(!Number.isFinite(nextPrice)||nextPrice<0||nextPrice>99_999_999.99)throw new CloudBaseStoreError('请填写有效价格',400,'price');
    if(!nextConcern)throw new CloudBaseStoreError('请填写或选择你最担心的问题',400,'concern');
    if(!isKnownWishType(nextType))throw new CloudBaseStoreError('请选择类型',400,'type');
    patch.revision = currentRev + 1;
    patch.updatedAt = now();
    patch.similar_item = patch.concern ?? request.similar_item;
    await saveDocument(collections.requests, requestId, { ...request, ...patch, owner_id: ownerId });
    return { request: normalizeWish({ ...request, ...patch } as unknown as Record<string, unknown>) };
  }

  if (body.action === 'create_invite') {
    const requestId = String(body.requestId ?? '');
    const request = await ownedDocument(collections.requests, requestId, ownerId);
    if (!request || request.status !== 'REVIEWING') throw new CloudBaseStoreError('这个心愿已经结束征集', 409);
    const existing = (await ownerDocuments(collections.invites, ownerId)).filter(item => item.request_id === requestId);
    const invite: ReviewInvite = {
      id: crypto.randomUUID(),
      request_id: requestId,
      token: inviteToken(),
      label: `朋友 ${existing.length + 1}`,
      used_by: null,
      used_at: null,
      revoked: 0,
      created_at: now(),
    };
    await saveDocument(collections.invites, invite.id, { ...invite, owner_id: ownerId });
    return { invite };
  }

  if (body.action === 'revoke_invite') {
    const inviteId = String(body.inviteId ?? '');
    const invite = await ownedDocument(collections.invites, inviteId, ownerId);
    if (invite && !invite.used_at) await db.collection(collections.invites).doc(inviteId).update({ revoked: 1 });
    return { ok: true };
  }

  if (body.action === 'add_saving') {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new CloudBaseStoreError('金额必须大于 0');
    const goalId = String(body.goalId ?? '');
    const document = await ownedDocument(collections.saving, goalId, ownerId);
    if (!document) throw new CloudBaseStoreError('没有找到这个养愿目标', 404);

    const current = Math.min(Number(document.target), Number(document.current) + amount);
    await db.collection(collections.saving).doc(goalId).update({ current });
    const goal = { ...cleanDocument(document), current } as unknown as SavingGoal;
    if (current < Number(document.target)) return { goal, completed: false };

    const requestId = document.request_id ? String(document.request_id) : null;
    const source = requestId ? await ownedDocument(collections.requests, requestId, ownerId) : null;
    const type = source ? assetTypeForWish(source.type as PurchaseRequest['type'],String(source.category??'')) : 'ITEM';
    const assetId = requestId ? `asset-${requestId}` : `asset-${goalId}`;
    const asset: Asset = {
      id: assetId,
      name: String(document.name),
      type,
      purchase_price: Number(document.target),
      total_units: type === 'EXPERIENCE' ? 1 : source?.total_units == null ? null : Number(source.total_units),
      used_units: 0,
      current_balance: type === 'STORED_VALUE' ? Number(document.target) : null,
      expiry_date: source?.expiry_date ? String(source.expiry_date) : null,
      usage_count: 0,
      last_used_at: null,
      bloom_until: new Date(Date.now() + 20_000).toISOString(),
    };
    await saveDocument(collections.assets, assetId, { ...asset, request_id: requestId, owner_id: ownerId, created_at: now() });
    if (requestId) await db.collection(collections.requests).doc(requestId).update({ status: 'PURCHASED' });
    await db.collection(collections.saving).doc(goalId).remove();
    return { goal, completed: true, asset };
  }

  if (body.action === 'add_asset') {
    const id = crypto.randomUUID();
    let asset:Asset;
    try{asset=parseAssetPayload(id,body.payload as Record<string,unknown>)}catch(error){if(error instanceof AssetRuleError)throw new CloudBaseStoreError(error.message,error.status);throw error}
    await saveDocument(collections.assets, id, { ...asset, owner_id: ownerId, request_id: null, created_at: now() });
    return { asset };
  }

  if (body.action === 'delete_asset') {
    const assetId = String(body.assetId ?? '');
    const asset = await ownedDocument(collections.assets, assetId, ownerId);
    if (!asset) throw new CloudBaseStoreError('没有找到这个物资', 404);
    const usageRecords = await ownerDocuments(collections.usage, ownerId);
    await Promise.all(usageRecords.filter(item => item.asset_id === assetId).map(item => db.collection(collections.usage).doc(String(item.id || item._id)).remove()));
    await db.collection(collections.assets).doc(assetId).remove();
    return { ok: true };
  }

  if (body.action === 'use_asset') {
    const assetId = String(body.assetId ?? '');
    const document = await ownedDocument(collections.assets, assetId, ownerId);
    if (!document) throw new CloudBaseStoreError('没有找到这个物资', 404);
    let usage;
    try{usage=applyAssetUsage(cleanDocument(document) as unknown as Asset,body.amount)}catch(error){if(error instanceof AssetRuleError)throw new CloudBaseStoreError(error.message,error.status);throw error}
    await db.collection(collections.assets).doc(assetId).update({ used_units:usage.used_units,usage_count:usage.usage_count,current_balance:usage.current_balance,last_used_at: today(), recovering_until: new Date(Date.now() + 10_000).toISOString() });
    const usageId = crypto.randomUUID();
    await saveDocument(collections.usage, usageId, { owner_id: ownerId, asset_id: assetId, usage_type: document.type==='STORED_VALUE'?'SPEND':'USED_TODAY', amount:usage.amount, client_event_id: crypto.randomUUID(), created_at: now() });
    return { ok: true, asset:{...cleanDocument(document),used_units:usage.used_units,usage_count:usage.usage_count,current_balance:usage.current_balance,last_used_at:today()} };
  }

  if (body.action === 'add_asset_reflection') {
    const assetId = String(body.assetId ?? '');
    const document = await ownedDocument(collections.assets, assetId, ownerId);
    if (!document) throw new CloudBaseStoreError('没有找到这个物资', 404);
    let reflectionInput:ReturnType<typeof parseAssetReflectionPayload>;
    try{reflectionInput=parseAssetReflectionPayload(body)}catch(error){if(error instanceof AssetRuleError)throw new CloudBaseStoreError(error.message,error.status);throw error}
    const {feeling,rating,wouldBuyAgain,note,trigger}=reflectionInput;
    const asset = cleanDocument(document) as unknown as Asset;
    const createdAt=now();
    const reflection:AssetReflection={id:crypto.randomUUID(),asset_id:assetId,asset_name:asset.name,asset_type:asset.type,feeling,rating,would_buy_again:wouldBuyAgain,note,trigger,usage_count:asset.usage_count,cost_per_use:costPerUse(asset),created_at:createdAt};
    await saveDocument(collections.reflections, reflection.id, { ...reflection, owner_id: ownerId });
    const archivedAt=trigger==='MANUAL' ? asset.archived_at??null : asset.archived_at??createdAt;
    if(trigger!=='MANUAL')await db.collection(collections.assets).doc(assetId).update({archived_at:archivedAt});
    await awardCloudBaseGrowth(ownerId,'asset_reflection',assetId,15);
    return { reflection,asset:{...asset,archived_at:archivedAt} };
  }

  if (body.action === 'save_decision_note') {
    const requestId = String(body.requestId ?? '');
    const request = await ownedDocument(collections.requests, requestId, ownerId);
    if (!request) throw new CloudBaseStoreError('没有找到这个心愿', 404);
    const note = String(body.note ?? '').trim().slice(0, 2000);
    await db.collection(collections.requests).doc(requestId).update({ decision_note: note });
    return { ok: true };
  }

  if (body.action === 'decide') {
    const decision = String(body.decision) as ReviewChoice;
    if (!['BUY_NOW', 'SAVE_FIRST', 'WAIT'].includes(decision)) throw new CloudBaseStoreError('无效决定');
    const requestId = String(body.requestId ?? '');
    const source = await ownedDocument(collections.requests, requestId, ownerId);
    if (!source || source.status !== 'REVIEWING') throw new CloudBaseStoreError('这个心愿已经完成决定', 409);

    const note = String(body.note ?? '').trim().slice(0, 2000);
    const status = decision === 'BUY_NOW' ? 'PURCHASED' : decision === 'SAVE_FIRST' ? 'SAVING' : 'ARCHIVED';
    await db.collection(collections.requests).doc(requestId).update(note ? { status, decision_note: note } : { status });
    await saveDocument(collections.decisions, `decision-${requestId}`, { owner_id: ownerId, request_id: requestId, decision, decided_at: now() });
    if (note) await awardCloudBaseGrowth(ownerId, 'decision_with_reason', requestId, 20);
    const invites = (await ownerDocuments(collections.invites, ownerId)).filter(item => item.request_id === requestId && !item.used_at);
    await Promise.all(invites.map(invite => db.collection(collections.invites).doc(String(invite.id || invite._id)).update({ revoked: 1 })));

    if (decision === 'SAVE_FIRST') {
      const savingId = `saving-${requestId}`;
      await saveDocument(collections.saving, savingId, { owner_id: ownerId, request_id: requestId, name: String(source.name), target: Number(source.price), current: 0, weekly_plan: null, created_at: now() });
    }
    if (decision === 'BUY_NOW') {
      const type = assetTypeForWish(source.type as PurchaseRequest['type'],String(source.category??''));
      const assetId = `asset-${requestId}`;
      await saveDocument(collections.assets, assetId, { owner_id: ownerId, request_id: requestId, name: String(source.name), type, purchase_price: Number(source.price), total_units: type === 'EXPERIENCE' ? 1 : source.total_units ?? null, used_units: 0, current_balance: type === 'STORED_VALUE' ? Number(source.price) : null, expiry_date: source.expiry_date ?? null, usage_count: 0, last_used_at: null, bloom_until: new Date(Date.now() + 20_000).toISOString(), created_at: now() });
    }
    const goal = decision === 'SAVE_FIRST' ? cleanDocument((await ownedDocument(collections.saving, `saving-${requestId}`, ownerId))!) : null;
    const asset = decision === 'BUY_NOW' ? cleanDocument((await ownedDocument(collections.assets, `asset-${requestId}`, ownerId))!) : null;
    return { ok: true, target: decision === 'BUY_NOW' ? 'assets' : decision === 'SAVE_FIRST' ? 'saving' : 'wishes', goal, asset };
  }

  throw new CloudBaseStoreError('不支持的操作');
}

export async function recordCloudBaseDeviceUsage(ownerId:string, assetId:string, clientEventId:string) {
  const usageId = `device-${clientEventId}`;
  const existingResult = await getCloudBaseDb().collection(collections.usage).doc(usageId).get();
  if ((existingResult.data || []).length) return {ok:true,duplicate:true};

  const asset = await ownedDocument(collections.assets, assetId, ownerId);
  if (!asset) throw new CloudBaseStoreError('没有找到这个物资', 404);
  if(asset.type==='STORED_VALUE')throw new CloudBaseStoreError('储值类需要在网页填写本次消费金额',400);
  let usage;
  try{usage=applyAssetUsage(cleanDocument(asset) as unknown as Asset)}catch(error){if(error instanceof AssetRuleError)throw new CloudBaseStoreError(error.message,error.status);throw error}
  await getCloudBaseDb().collection(collections.assets).doc(assetId).update({
    used_units:usage.used_units,
    usage_count:usage.usage_count,
    current_balance:usage.current_balance,
    last_used_at: today(),
    recovering_until: new Date(Date.now() + 10_000).toISOString(),
  });
  await saveDocument(collections.usage, usageId, {
    owner_id: ownerId,
    asset_id: assetId,
    usage_type: 'USED_TODAY',
    client_event_id: clientEventId,
    created_at: now(),
  });
  return {ok:true,duplicate:false};
}

export async function getCloudBaseReview(token: string) {
  const db = getCloudBaseDb();
  const inviteResult = await db.collection(collections.invites).where({ token }).limit(1).get();
  const invite = (inviteResult.data || [])[0] as CloudDocument | undefined;
  if (!invite) throw new CloudBaseStoreError('链接不存在或已撤销', 404, 'REVIEW_LINK_NOT_FOUND');
  const requestResult = await db.collection(collections.requests).doc(String(invite.request_id)).get();
  const request = (requestResult.data || [])[0] as CloudDocument | undefined;
  let linkState: 'ACTIVE' | 'USED' | 'REVOKED' | 'REQUEST_DECIDED' | 'EXPIRED' = 'ACTIVE';
  if (invite.revoked) linkState = 'REVOKED';
  else if (invite.used_at) linkState = 'USED';
  else if (!request || request.status !== 'REVIEWING' || request.owner_id !== invite.owner_id) linkState = 'REQUEST_DECIDED';
  if (linkState !== 'ACTIVE') throw new CloudBaseStoreError('这张邀请卡已经完成使命了', 410, linkState);
  const normalized = normalizeWish(request as unknown as Record<string, unknown>);
  const requestSubset = {
    id: normalized.id, name: normalized.name, price: normalized.price, type: normalized.type,
    reason: normalized.reason, concern: normalized.concern, brand: normalized.brand,
    skuLabel: normalized.skuLabel, details: normalized.details, sourcePlatform: normalized.sourcePlatform,
    productUrl: normalized.productUrl, images: normalized.images, revision: normalized.revision,
  };
  return { request: requestSubset, ownerDisplay: null as null, linkState: 'ACTIVE' as const };
}

export async function submitCloudBaseReview(body: { token?: string; reviewerName?: string; reviewerRole?: string; stamp?: string; reasons?: string[]; note?: string; choice?: ReviewChoice; comment?: string }) {
  const name = (body.reviewerName?.trim() || '匿名朋友').slice(0, 20);
  const reasons = Array.isArray(body.reasons) ? body.reasons.filter(Boolean) : [];
  const note = body.note ? String(body.note).slice(0, 80) : '';
  if (!body.token) throw new CloudBaseStoreError('链接不完整', 400, 'REVIEW_LINK_INVALID');
  if (!body.stamp && !body.choice) throw new CloudBaseStoreError('请完成判断章', 400, 'REVIEW_STAMP_REQUIRED');
  if (!body.comment) {
    body.comment = [reasons.join('；'), note ? `备注：${note}` : ''].filter(Boolean).join('\n');
  }
  if (!body.comment?.trim()) throw new CloudBaseStoreError('请完成理由', 400, 'REVIEW_REASONS_REQUIRED');
  if (body.stamp && !body.choice) {
    const stampToChoice: Record<string, ReviewChoice> = { FITS: 'BUY_NOW', CONDITIONAL: 'SAVE_FIRST', WAIT: 'WAIT', NOT_FIT: 'WAIT', NEED_INFO: 'WAIT' };
    body.choice = stampToChoice[body.stamp];
  }

  const db = getCloudBaseDb();
  const inviteResult = await db.collection(collections.invites).where({ token: body.token }).limit(1).get();
  const invite = (inviteResult.data || [])[0] as CloudDocument | undefined;
  if (!invite || invite.revoked || invite.used_at) throw new CloudBaseStoreError('这张邀请卡已使用或心愿已结束', 409, 'REVIEW_LINK_USED');
  const requestResult = await db.collection(collections.requests).doc(String(invite.request_id)).get();
  const request = (requestResult.data || [])[0] as CloudDocument | undefined;
  if (!request || request.status !== 'REVIEWING' || request.owner_id !== invite.owner_id) throw new CloudBaseStoreError('这张邀请卡已使用或心愿已结束', 409, 'REVIEW_LINK_USED');

  const usedAt = now();
  const claimed = await db.collection(collections.invites).where({ _id: String(invite._id), used_at: null, revoked: 0 }).update({ used_by: name, used_at: usedAt });
  if (claimed.updated !== 1) throw new CloudBaseStoreError('这张邀请卡刚刚已经被使用了', 409, 'REVIEW_LINK_USED');
  const reviewId = crypto.randomUUID();
  const rev = Number(request.revision ?? 1);
  const normalizedRequest = normalizeWish(request as unknown as Record<string, unknown>);
  const context = buildReviewContext(normalizedRequest);
  await saveDocument(collections.reviews, reviewId, {
    owner_id: String(invite.owner_id), request_id: String(invite.request_id),
    reviewer_name: name, choice: body.choice, comment: String(body.comment).slice(0, 500),
    reviewer_role: body.reviewerRole ?? null, stamp: body.stamp ?? null,
    reasons: JSON.stringify(reasons), note: note || null,
    request_revision: rev, wish_snapshot: JSON.stringify(context.wishSnapshot),
    legacy_context: 0, created_at: usedAt, claimed_by: null, claimed_at: null,
  });
  const claimToken = crypto.randomUUID().replaceAll('-', '');
  const tokenDigest = await digestClaimToken(claimToken);
  await saveDocument(collections.claimTokens, `claim-${reviewId}`, {
    owner_id: String(invite.owner_id),
    token_digest: tokenDigest,
    review_id: reviewId,
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    status: 'PENDING',
    created_at: usedAt,
  });
  return { reviewId, claimToken, successText: '感谢你的真实视角，已送到朋友手里。' };
}
