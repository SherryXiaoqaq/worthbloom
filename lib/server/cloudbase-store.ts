import 'server-only';

import type { AppData, Asset, PurchaseRequest, Review, ReviewChoice, ReviewInvite, SavingGoal } from '@/lib/types';
import { getCloudBaseDb } from './cloudbase';

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
} as const;

const assetTypes: Asset['type'][] = ['COURSE', 'MEMBERSHIP', 'STORED_VALUE', 'ITEM'];
const now = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);
const inviteToken = () => crypto.randomUUID().replaceAll('-', '').slice(0, 20);

export class CloudBaseStoreError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

function requestType(category: string): Asset['type'] {
  if (category.includes('课程')) return 'COURSE';
  if (category.includes('会员')) return 'MEMBERSHIP';
  if (category.includes('储值')) return 'STORED_VALUE';
  return 'ITEM';
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

export async function loadCloudBaseData(ownerId: string): Promise<AppData> {
  const [requestDocuments, reviewDocuments, inviteDocuments, savingDocuments, assetDocuments] = await Promise.all([
    ownerDocuments(collections.requests, ownerId),
    ownerDocuments(collections.reviews, ownerId),
    ownerDocuments(collections.invites, ownerId),
    ownerDocuments(collections.saving, ownerId),
    ownerDocuments(collections.assets, ownerId),
  ]);

  const reviewCounts = new Map<string, number>();
  for (const review of reviewDocuments) {
    const requestId = String(review.request_id || '');
    reviewCounts.set(requestId, (reviewCounts.get(requestId) || 0) + 1);
  }

  const requests = newestFirst(requestDocuments.map(document => ({
    ...cleanDocument(document),
    review_count: reviewCounts.get(String(document.id || document._id || '')) || 0,
  }))) as unknown as PurchaseRequest[];

  return {
    requests,
    reviews: newestFirst(reviewDocuments.map(cleanDocument)) as unknown as Review[],
    invites: newestFirst(inviteDocuments.map(cleanDocument)) as unknown as ReviewInvite[],
    savingGoals: newestFirst(savingDocuments.map(cleanDocument)) as unknown as SavingGoal[],
    assets: newestFirst(assetDocuments.map(cleanDocument)) as unknown as Asset[],
  };
}

export async function handleCloudBaseDataAction(ownerId: string, body: ActionBody) {
  const db = getCloudBaseDb();

  if (body.action === 'create_request') {
    const payload = body.payload as Record<string, string | number | null>;
    const name = String(payload.name ?? '').trim();
    const reason = String(payload.reason ?? '').trim();
    const price = Number(payload.price);
    if (!name || !reason || !Number.isFinite(price) || price < 0) throw new CloudBaseStoreError('请完整填写名称、价格和理由');

    const id = crypto.randomUUID();
    const createdAt = now();
    const request: PurchaseRequest = {
      id,
      name,
      price,
      reason,
      category: String(payload.category ?? '其他'),
      total_units: payload.total_units == null ? null : Number(payload.total_units),
      usage_frequency: payload.usage_frequency ? String(payload.usage_frequency) : null,
      expiry_date: payload.expiry_date ? String(payload.expiry_date) : null,
      product_url: payload.product_url ? String(payload.product_url) : null,
      similar_item: payload.similar_item ? String(payload.similar_item) : null,
      status: 'REVIEWING',
      review_token: inviteToken(),
      created_at: createdAt,
      review_count: 0,
    };
    await saveDocument(collections.requests, id, { ...request, owner_id: ownerId });

    const invites: ReviewInvite[] = [1, 2, 3].map(index => ({
      id: crypto.randomUUID(),
      request_id: id,
      token: inviteToken(),
      label: `朋友 ${index}`,
      used_by: null,
      used_at: null,
      revoked: 0,
      created_at: now(),
    }));
    await Promise.all(invites.map(invite => saveDocument(collections.invites, invite.id, { ...invite, owner_id: ownerId })));
    return { request, invites };
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
    const type = source ? requestType(String(source.category)) : 'ITEM';
    const assetId = requestId ? `asset-${requestId}` : `asset-${goalId}`;
    const asset: Asset = {
      id: assetId,
      name: String(document.name),
      type,
      purchase_price: Number(document.target),
      total_units: source?.total_units == null ? null : Number(source.total_units),
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
    const payload = body.payload as Record<string, string | number | null>;
    const name = String(payload.name ?? '').trim();
    const type = String(payload.type ?? 'ITEM') as Asset['type'];
    const price = Number(payload.purchase_price);
    if (!name || !assetTypes.includes(type) || !Number.isFinite(price) || price < 0) throw new CloudBaseStoreError('请完整填写物资名称、类型和购入金额');

    const id = crypto.randomUUID();
    const totalUnits = payload.total_units === null || payload.total_units === '' ? null : Math.max(0, Number(payload.total_units));
    const usedUnits = Math.max(0, Number(payload.used_units ?? 0));
    const usageCount = Math.max(0, Number(payload.usage_count ?? usedUnits));
    const balance = payload.current_balance === null || payload.current_balance === '' ? null : Math.max(0, Number(payload.current_balance));
    const asset: Asset = {
      id,
      name,
      type,
      purchase_price: price,
      total_units: totalUnits,
      used_units: usedUnits,
      current_balance: balance,
      expiry_date: payload.expiry_date ? String(payload.expiry_date) : null,
      usage_count: usageCount,
      last_used_at: usageCount ? today() : null,
    };
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
    const totalUnits = document.total_units == null ? null : Number(document.total_units);
    const usedUnits = totalUnits == null ? Number(document.used_units) : Math.min(totalUnits, Number(document.used_units) + 1);
    await db.collection(collections.assets).doc(assetId).update({ used_units: usedUnits, usage_count: Number(document.usage_count) + 1, last_used_at: today(), recovering_until: new Date(Date.now() + 10_000).toISOString() });
    const usageId = crypto.randomUUID();
    await saveDocument(collections.usage, usageId, { owner_id: ownerId, asset_id: assetId, usage_type: 'USED_TODAY', client_event_id: crypto.randomUUID(), created_at: now() });
    return { ok: true };
  }

  if (body.action === 'decide') {
    const decision = String(body.decision) as ReviewChoice;
    if (!['BUY_NOW', 'SAVE_FIRST', 'WAIT'].includes(decision)) throw new CloudBaseStoreError('无效决定');
    const requestId = String(body.requestId ?? '');
    const source = await ownedDocument(collections.requests, requestId, ownerId);
    if (!source || source.status !== 'REVIEWING') throw new CloudBaseStoreError('这个心愿已经完成决定', 409);

    const status = decision === 'BUY_NOW' ? 'PURCHASED' : decision === 'SAVE_FIRST' ? 'SAVING' : 'ARCHIVED';
    await db.collection(collections.requests).doc(requestId).update({ status });
    await saveDocument(collections.decisions, `decision-${requestId}`, { owner_id: ownerId, request_id: requestId, decision, decided_at: now() });
    const invites = (await ownerDocuments(collections.invites, ownerId)).filter(item => item.request_id === requestId && !item.used_at);
    await Promise.all(invites.map(invite => db.collection(collections.invites).doc(String(invite.id || invite._id)).update({ revoked: 1 })));

    if (decision === 'SAVE_FIRST') {
      const savingId = `saving-${requestId}`;
      await saveDocument(collections.saving, savingId, { owner_id: ownerId, request_id: requestId, name: String(source.name), target: Number(source.price), current: 0, weekly_plan: null, created_at: now() });
    }
    if (decision === 'BUY_NOW') {
      const type = requestType(String(source.category));
      const assetId = `asset-${requestId}`;
      await saveDocument(collections.assets, assetId, { owner_id: ownerId, request_id: requestId, name: String(source.name), type, purchase_price: Number(source.price), total_units: source.total_units ?? null, used_units: 0, current_balance: type === 'STORED_VALUE' ? Number(source.price) : null, expiry_date: source.expiry_date ?? null, usage_count: 0, last_used_at: null, bloom_until: new Date(Date.now() + 20_000).toISOString(), created_at: now() });
    }
    return { ok: true, target: decision === 'BUY_NOW' ? 'assets' : decision === 'SAVE_FIRST' ? 'saving' : 'wishes' };
  }

  throw new CloudBaseStoreError('不支持的操作');
}

export async function recordCloudBaseDeviceUsage(ownerId:string, assetId:string, clientEventId:string) {
  const usageId = `device-${clientEventId}`;
  const existingResult = await getCloudBaseDb().collection(collections.usage).doc(usageId).get();
  if ((existingResult.data || []).length) return {ok:true,duplicate:true};

  const asset = await ownedDocument(collections.assets, assetId, ownerId);
  if (!asset) throw new CloudBaseStoreError('没有找到这个物资', 404);
  const totalUnits = asset.total_units == null ? null : Number(asset.total_units);
  const usedUnits = totalUnits == null ? Number(asset.used_units) : Math.min(totalUnits, Number(asset.used_units) + 1);
  await getCloudBaseDb().collection(collections.assets).doc(assetId).update({
    used_units: usedUnits,
    usage_count: Number(asset.usage_count) + 1,
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
  if (!invite) throw new CloudBaseStoreError('链接不存在或已撤销', 404);
  const requestResult = await db.collection(collections.requests).doc(String(invite.request_id)).get();
  const request = (requestResult.data || [])[0] as CloudDocument | undefined;
  if (invite.revoked || invite.used_at || !request || request.status !== 'REVIEWING' || request.owner_id !== invite.owner_id) {
    throw new CloudBaseStoreError('这张邀请卡已经完成使命了', 410);
  }
  return {
    request: {
      id: String(request.id || request._id),
      name: request.name,
      price: request.price,
      reason: request.reason,
      category: request.category,
      total_units: request.total_units ?? null,
      usage_frequency: request.usage_frequency ?? null,
      expiry_date: request.expiry_date ?? null,
      product_url: request.product_url ?? null,
      similar_item: request.similar_item ?? null,
      status: request.status,
    },
  };
}

export async function submitCloudBaseReview(body: { token?: string; reviewerName?: string; choice?: ReviewChoice; comment?: string }) {
  const name = body.reviewerName?.trim();
  const comment = body.comment?.trim();
  if (!body.token || !name || !comment || !body.choice || !['BUY_NOW', 'SAVE_FIRST', 'WAIT'].includes(body.choice)) {
    throw new CloudBaseStoreError('请完成昵称、建议和原因');
  }

  const db = getCloudBaseDb();
  const inviteResult = await db.collection(collections.invites).where({ token: body.token }).limit(1).get();
  const invite = (inviteResult.data || [])[0] as CloudDocument | undefined;
  if (!invite || invite.revoked || invite.used_at) throw new CloudBaseStoreError('这张邀请卡已使用或心愿已结束', 409);
  const requestResult = await db.collection(collections.requests).doc(String(invite.request_id)).get();
  const request = (requestResult.data || [])[0] as CloudDocument | undefined;
  if (!request || request.status !== 'REVIEWING' || request.owner_id !== invite.owner_id) throw new CloudBaseStoreError('这张邀请卡已使用或心愿已结束', 409);

  const usedAt = now();
  const claimed = await db.collection(collections.invites).where({ _id: String(invite._id), used_at: null, revoked: 0 }).update({ used_by: name.slice(0, 20), used_at: usedAt });
  if (claimed.updated !== 1) throw new CloudBaseStoreError('这张邀请卡刚刚已经被使用了', 409);
  const reviewId = crypto.randomUUID();
  await saveDocument(collections.reviews, reviewId, { owner_id: String(invite.owner_id), request_id: String(invite.request_id), reviewer_name: name.slice(0, 20), choice: body.choice, comment: comment.slice(0, 500), created_at: usedAt });
  return { ok: true };
}
