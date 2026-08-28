import { getDb } from '@/lib/server/db';
import { CloudBaseAuthError, requireCloudBaseUser } from '@/lib/server/cloudbase-auth';
import { isCloudBaseServerConfigured } from '@/lib/server/cloudbase';
import { CloudBaseStoreError, handleCloudBaseDataAction, loadCloudBaseData } from '@/lib/server/cloudbase-store';
import { getLocalData, handleLocalDataAction, isLocalPreview, LocalStoreError } from '@/lib/server/local-store';
import { isOwnerRequest, ownerOnly } from '@/lib/server/owner';
import type { Asset, AssetReflection, ReviewChoice, WishType } from '@/lib/types';
import { applyAssetUsage, assetTypeForWish, AssetRuleError, costPerUse, normalizeAssetReflection, parseAssetPayload, parseAssetReflectionPayload } from '@/lib/asset-rules';
import { canonicalWishType, isKnownWishType, normalizeDecision, normalizeSavingGoal, normalizeWish, normalizeReview, typeToCategory } from '@/lib/wish-compat';

export const dynamic = 'force-dynamic';

function inviteToken() {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 20);
}

async function loadData() {
  const db = await getDb();
  const [requests, reviews, invites, savingGoals, assets, decisions, images, assetReflections] = await Promise.all([
    db.prepare(`SELECT p.*, COUNT(r.id) AS review_count FROM purchase_requests p LEFT JOIN reviews r ON r.request_id = p.id GROUP BY p.id ORDER BY p.created_at DESC`).all(),
    db.prepare(`SELECT * FROM reviews ORDER BY created_at DESC`).all(),
    db.prepare(`SELECT * FROM review_invites ORDER BY created_at ASC`).all(),
    db.prepare(`SELECT * FROM saving_goals ORDER BY created_at DESC`).all(),
    db.prepare(`SELECT * FROM assets ORDER BY created_at DESC`).all(),
    db.prepare(`SELECT request_id, decision, decided_at FROM final_decisions ORDER BY decided_at DESC`).all(),
    db.prepare(`SELECT id, request_id, url, sort_order, is_cover FROM wish_images ORDER BY sort_order ASC`).all(),
    db.prepare(`SELECT * FROM asset_reflections ORDER BY created_at DESC`).all(),
  ]);
  const imagesByRequest = new Map<string, Array<{ id: string; url: string; sortOrder: number; isCover: boolean }>>();
  for (const img of (images.results as Array<Record<string, unknown>>)) {
    const rid = String(img.request_id);
    const arr = imagesByRequest.get(rid) ?? [];
    arr.push({ id: String(img.id), url: String(img.url), sortOrder: Number(img.sort_order), isCover: Boolean(img.is_cover) });
    imagesByRequest.set(rid, arr);
  }
  const requestRows = (requests.results as Array<Record<string, unknown>>).map(r => {
    r.images = imagesByRequest.get(String(r.id)) ?? [];
    return normalizeWish(r);
  });
  const reviewRows = (reviews.results as Array<Record<string, unknown>>).map(r => normalizeReview(r));
  const assetRows = (assets.results as unknown as Asset[]).map(asset => ({...asset,archived_at:asset.archived_at??null}));
  const reflectionRows = (assetReflections.results as unknown as AssetReflection[]).map(normalizeAssetReflection);
  const normalizedDecisions = (decisions.results as Array<Record<string, unknown>>)
    .map(normalizeDecision)
    .filter((decision): decision is NonNullable<ReturnType<typeof normalizeDecision>> => decision !== null);
  const normalizedGoals = (savingGoals.results as Array<Record<string, unknown>>).map(normalizeSavingGoal);
  return { requests: requestRows, reviews: reviewRows, invites: invites.results, decisions: normalizedDecisions, savingGoals: normalizedGoals, assets: assetRows, assetReflections: reflectionRows };
}

export async function GET(request: Request) {
  if (isCloudBaseServerConfigured()) {
    try {
      const user = await requireCloudBaseUser(request);
      return Response.json(await loadCloudBaseData(user.id));
    } catch (error) {
      const status = error instanceof CloudBaseAuthError || error instanceof CloudBaseStoreError ? error.status : 500;
      return Response.json({ error: error instanceof Error ? error.message : 'CloudBase 数据库不可用' }, { status });
    }
  }
  if (!isOwnerRequest(request.headers)) return ownerOnly();
  if (isLocalPreview(request)) return Response.json(getLocalData());
  try { return Response.json(await loadData()); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'database unavailable' }, { status: 500 }); }
}

export async function POST(request: Request) {
  if (isCloudBaseServerConfigured()) {
    try {
      const user = await requireCloudBaseUser(request);
      const body = await request.json() as Record<string, unknown>;
      const output = await handleCloudBaseDataAction(user.id, body);
      return Response.json(output, { status: body.action === 'create_request' || body.action === 'create_invite' || body.action === 'add_asset' || body.action === 'add_asset_reflection' ? 201 : 200 });
    } catch (error) {
      const status = error instanceof CloudBaseAuthError || error instanceof CloudBaseStoreError ? error.status : 500;
      return Response.json({ error: error instanceof Error ? error.message : 'CloudBase 操作失败' }, { status });
    }
  }
  if (!isOwnerRequest(request.headers)) return ownerOnly();
  try {
    const body = await request.json() as Record<string, unknown>;
    if (isLocalPreview(request)) return Response.json(handleLocalDataAction(body));
    const db = await getDb();

    if (body.action === 'create_request') {
      const payload = body.payload as Record<string, unknown>;
      const id = crypto.randomUUID();
      const reviewTokenValue = crypto.randomUUID().replaceAll('-', '').slice(0, 20);
      const name = String(payload.name ?? '').trim().slice(0, 80);
      const reason = String(payload.reason ?? '').trim().slice(0, 500);
      const price = Number(payload.price);
      const concern = String(payload.concern ?? payload.similar_item ?? '').trim().slice(0, 200);
      const suppliedType = String(payload.type ?? '').trim();
      const legacyCategory = String(payload.category ?? '').trim();
      if (!name) return Response.json({ error: '请填写商品或课程名称', code: 'FIELD_REQUIRED', field: 'name' }, { status: 400 });
      if (!reason) return Response.json({ error: '请填写你为什么想要它', code: 'FIELD_REQUIRED', field: 'reason' }, { status: 400 });
      if (!Number.isFinite(price) || price < 0 || price > 99_999_999.99) return Response.json({ error: '请填写有效价格', code: 'FIELD_REQUIRED', field: 'price' }, { status: 400 });
      if (!concern) return Response.json({ error: '请填写或选择你最担心的问题', code: 'FIELD_REQUIRED', field: 'concern' }, { status: 400 });
      if ((!suppliedType && !legacyCategory) || (suppliedType && !isKnownWishType(suppliedType))) return Response.json({ error: '请选择类型', code: 'FIELD_REQUIRED', field: 'type' }, { status: 400 });
      const typeRaw = canonicalWishType(suppliedType, legacyCategory);
      const ts = new Date().toISOString();
      await db.prepare(`INSERT INTO purchase_requests (id,name,price,reason,category,total_units,usage_frequency,expiry_date,product_url,similar_item,status,review_token,revision,source_type,type,concern,brand,sku_label,details,source_platform,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?,?,?,?)`)
        .bind(id, name, price, reason, typeToCategory(typeRaw), payload.total_units ?? payload.totalUnits ?? null, payload.usage_frequency ?? payload.usageFrequency ?? null, payload.expiry_date ?? payload.expiryDate ?? null, payload.product_url ?? payload.productUrl ?? null, concern, 'REVIEWING', reviewTokenValue, payload.source_type ?? payload.sourceType ?? 'MANUAL', typeRaw, concern, String(payload.brand ?? '').slice(0, 80), String(payload.sku_label ?? payload.skuLabel ?? '').slice(0, 120), String(payload.details ?? '').slice(0, 2000), String(payload.source_platform ?? payload.sourcePlatform ?? '').slice(0, 40), ts, ts).run();
      // wish images
      if (Array.isArray(payload.images) && payload.images.length) {
        const imgStmts = (payload.images as Array<Record<string, unknown>>).slice(0, 6).map((img, index) => db.prepare(`INSERT INTO wish_images (id,request_id,url,sort_order,is_cover) VALUES (?,?,?,?,?)`).bind(String(img.id ?? crypto.randomUUID()), id, String(img.url ?? ''), Number(img.sortOrder ?? index), img.isCover ? 1 : index === 0 ? 1 : 0));
        await db.batch(imgStmts);
      }
      const inviteStatements = [db.prepare(`INSERT INTO review_invites (id,request_id,token,label) VALUES (?,?,?,?)`).bind(crypto.randomUUID(), id, inviteToken(), '群聊邀请')];
      await db.batch(inviteStatements);
      const row = (await db.prepare(`SELECT p.*, 0 AS review_count FROM purchase_requests p WHERE id = ?`).bind(id).first<Record<string, unknown>>())!;
      row.images = (payload.images as Array<Record<string, unknown>> | undefined)?.slice(0, 6).map((img, index) => ({ id: String(img.id ?? index), url: String(img.url ?? ''), sortOrder: Number(img.sortOrder ?? index), isCover: Boolean(img.isCover) })) ?? [];
      const invites = await db.prepare(`SELECT * FROM review_invites WHERE request_id = ? ORDER BY created_at`).bind(id).all();
      return Response.json({ request: normalizeWish(row), invites: invites.results }, { status: 201 });
    }

    if (body.action === 'update_request') {
      const requestId = String(body.requestId ?? '');
      const expected = Number(body.expectedRevision);
      const current = await db.prepare(`SELECT status, revision FROM purchase_requests WHERE id = ?`).bind(requestId).first<{ status: string; revision: number }>();
      if (!current) return Response.json({ error: '没有找到这个心愿', code: 'NOT_FOUND' }, { status: 404 });
      if (current.status !== 'REVIEWING') return Response.json({ error: '这个决定已经保存，可以复制为新心愿后继续调整。', code: 'REQUEST_READ_ONLY' }, { status: 409 });
      if (!Number.isFinite(expected) || expected !== current.revision) return Response.json({ error: '心愿已在其他页面更新，请刷新后重试。', code: 'REVISION_CONFLICT' }, { status: 409 });
      const payload = body.payload as Record<string, unknown>;
      const sets: string[] = [];
      const binds: unknown[] = [];
      const push = (col: string, val: unknown) => { sets.push(`${col} = ?`); binds.push(val); };
      if (typeof payload.name === 'string') push('name', payload.name.trim().slice(0, 80));
      if (typeof payload.price === 'number') push('price', payload.price);
      if (typeof payload.reason === 'string') push('reason', payload.reason.trim().slice(0, 500));
      if (typeof payload.concern === 'string') { push('concern', payload.concern.trim().slice(0, 200)); push('similar_item', payload.concern.trim().slice(0, 200)); }
      if (typeof payload.type === 'string') {
        if (!isKnownWishType(payload.type)) return Response.json({ error: '请选择类型', code: 'FIELD_REQUIRED', field: 'type' }, { status: 400 });
        const type = canonicalWishType(payload.type);
        push('type', type); push('category', typeToCategory(type));
      } else if (typeof payload.category === 'string') {
        const type = canonicalWishType(undefined, payload.category);
        push('type', type); push('category', typeToCategory(type));
      }
      if (typeof payload.brand === 'string') push('brand', payload.brand.slice(0, 80));
      if (payload.skuLabel !== undefined || payload.sku_label !== undefined) push('sku_label', String(payload.skuLabel ?? payload.sku_label).slice(0, 120));
      if (typeof payload.details === 'string') push('details', payload.details.slice(0, 2000));
      if (payload.productUrl !== undefined || payload.product_url !== undefined) push('product_url', payload.productUrl ?? payload.product_url);
      if (payload.sourcePlatform !== undefined || payload.source_platform !== undefined) push('source_platform', String(payload.sourcePlatform ?? payload.source_platform).slice(0, 40));
      if (payload.totalUnits !== undefined || payload.total_units !== undefined) push('total_units', payload.totalUnits ?? payload.total_units);
      if (payload.usageFrequency !== undefined || payload.usage_frequency !== undefined) push('usage_frequency', payload.usageFrequency ?? payload.usage_frequency);
      if (payload.expiryDate !== undefined || payload.expiry_date !== undefined) push('expiry_date', payload.expiryDate ?? payload.expiry_date);
      sets.push('revision = ?'); binds.push(current.revision + 1);
      sets.push('updated_at = ?'); binds.push(new Date().toISOString());
      binds.push(requestId, current.revision);
      const res = await db.prepare(`UPDATE purchase_requests SET ${sets.join(', ')} WHERE id = ? AND revision = ?`).bind(...binds).run();
      if (!res.meta.changes) return Response.json({ error: '心愿已在其他页面更新，请刷新后重试。', code: 'REVISION_CONFLICT' }, { status: 409 });
      // replace images if provided
      if (Array.isArray(payload.images)) {
        await db.prepare(`DELETE FROM wish_images WHERE request_id = ?`).bind(requestId).run();
        const imgStmts = (payload.images as Array<Record<string, unknown>>).slice(0, 6).map((img, index) => db.prepare(`INSERT INTO wish_images (id,request_id,url,sort_order,is_cover) VALUES (?,?,?,?,?)`).bind(String(img.id ?? crypto.randomUUID()), requestId, String(img.url ?? ''), Number(img.sortOrder ?? index), img.isCover ? 1 : index === 0 ? 1 : 0));
        if (imgStmts.length) await db.batch(imgStmts);
      }
      const row = (await db.prepare(`SELECT p.*, 0 AS review_count FROM purchase_requests p WHERE id = ?`).bind(requestId).first<Record<string, unknown>>())!;
      const imgs = await db.prepare(`SELECT id, url, sort_order, is_cover FROM wish_images WHERE request_id = ? ORDER BY sort_order`).bind(requestId).all();
      row.images = (imgs.results as Array<Record<string, unknown>>).map(img => ({ id: String(img.id), url: String(img.url), sortOrder: Number(img.sort_order), isCover: Boolean(img.is_cover) }));
      return Response.json({ request: normalizeWish(row) });
    }

    if (body.action === 'create_invite') {
      const requestId = String(body.requestId ?? '');
      const source = await db.prepare(`SELECT id,status FROM purchase_requests WHERE id = ?`).bind(requestId).first<{id:string;status:string}>();
      if (!source || source.status !== 'REVIEWING') return Response.json({ error: '这个心愿已经结束征集' }, { status: 409 });
      const existing = await db.prepare(`SELECT * FROM review_invites WHERE request_id = ? AND revoked = 0 ORDER BY created_at LIMIT 1`).bind(requestId).first();
      if (existing) return Response.json({ invite: existing });
      const id = crypto.randomUUID();
      await db.prepare(`INSERT INTO review_invites (id,request_id,token,label) VALUES (?,?,?,?)`).bind(id, requestId, inviteToken(), '群聊邀请').run();
      return Response.json({ invite: await db.prepare(`SELECT * FROM review_invites WHERE id = ?`).bind(id).first() }, { status: 201 });
    }

    if (body.action === 'revoke_invite') {
      await db.prepare(`UPDATE review_invites SET revoked = 1 WHERE id = ?`).bind(String(body.inviteId ?? '')).run();
      return Response.json({ ok: true });
    }

    if (body.action === 'add_saving') {
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount <= 0) return Response.json({ error: '金额必须大于 0' }, { status: 400 });
      const goalId = String(body.goalId ?? '');
      const existing = await db.prepare(`SELECT * FROM saving_goals WHERE id = ?`).bind(goalId).first<Record<string, unknown>>();
      if (!existing) return Response.json({ error: '没有找到这个养愿目标' }, { status: 404 });
      await db.prepare(`UPDATE saving_goals SET current = MIN(target, current + ?) WHERE id = ?`).bind(amount, goalId).run();
      const goal = await db.prepare(`SELECT * FROM saving_goals WHERE id = ?`).bind(goalId).first<Record<string, unknown>>();
      if (!goal || Number(goal.current) < Number(goal.target)) return Response.json({ goal, completed: false });

      const requestId = goal.request_id ? String(goal.request_id) : null;
      const source = requestId
        ? await db.prepare(`SELECT * FROM purchase_requests WHERE id = ?`).bind(requestId).first<Record<string, unknown>>()
        : null;
    const type = source ? assetTypeForWish(source.type as WishType,String(source.category??'')) : 'ITEM';
      const assetId = requestId ? `asset-${requestId}` : `asset-${goalId}`;
      const assetStatements = [
        db.prepare(`INSERT OR IGNORE INTO assets (id,request_id,name,type,purchase_price,total_units,used_units,current_balance,expiry_date,usage_count) VALUES (?,?,?,?,?,?,0,?,?,0)`)
          .bind(assetId, requestId, String(goal.name), type, Number(goal.target), type === 'EXPERIENCE' ? 1 : source?.total_units ?? null, type === 'STORED_VALUE' ? Number(goal.target) : null, source?.expiry_date ?? null),
        db.prepare(`DELETE FROM saving_goals WHERE id = ?`).bind(goalId),
      ];
      if (requestId) assetStatements.unshift(db.prepare(`UPDATE purchase_requests SET status = 'PURCHASED' WHERE id = ?`).bind(requestId));
      await db.batch(assetStatements);
      const asset = await db.prepare(`SELECT * FROM assets WHERE id = ?`).bind(assetId).first();
      return Response.json({ goal, completed: true, asset });
    }

    if (body.action === 'add_asset') {
      const id = crypto.randomUUID();
      let asset:Asset;
      try{asset=parseAssetPayload(id,body.payload as Record<string,unknown>)}catch(error){if(error instanceof AssetRuleError)return Response.json({error:error.message},{status:error.status});throw error}
      await db.prepare(`INSERT INTO assets (id,name,type,purchase_price,total_units,used_units,current_balance,expiry_date,usage_count,last_used_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .bind(asset.id,asset.name,asset.type,asset.purchase_price,asset.total_units,asset.used_units,asset.current_balance,asset.expiry_date,asset.usage_count,asset.last_used_at).run();
      return Response.json({ asset: await db.prepare(`SELECT * FROM assets WHERE id = ?`).bind(id).first() }, { status: 201 });
    }

    if (body.action === 'delete_asset') {
      const assetId = String(body.assetId ?? '');
      await db.batch([
        db.prepare(`DELETE FROM usage_records WHERE asset_id = ?`).bind(assetId),
        db.prepare(`DELETE FROM assets WHERE id = ?`).bind(assetId),
      ]);
      return Response.json({ ok: true });
    }

    if (body.action === 'use_asset') {
      const assetId = String(body.assetId ?? '');
      const asset=await db.prepare(`SELECT * FROM assets WHERE id = ?`).bind(assetId).first<Asset>();
      if(!asset)return Response.json({error:'没有找到这个物资'},{status:404});
      let usage;
      try{usage=applyAssetUsage(asset,body.amount)}catch(error){if(error instanceof AssetRuleError)return Response.json({error:error.message},{status:error.status});throw error}
      const eventId = crypto.randomUUID();
      await db.batch([
        db.prepare(`UPDATE assets SET used_units = ?, usage_count = ?, current_balance = ?, last_used_at = date('now') WHERE id = ?`).bind(usage.used_units,usage.usage_count,usage.current_balance,assetId),
        db.prepare(`INSERT INTO usage_records (id,asset_id,usage_type,amount,client_event_id) VALUES (?,?,?,?,?)`).bind(crypto.randomUUID(), assetId, asset.type==='STORED_VALUE'?'SPEND':'USED_TODAY',usage.amount,eventId),
      ]);
      return Response.json({ ok: true,asset:{...asset,used_units:usage.used_units,usage_count:usage.usage_count,current_balance:usage.current_balance,last_used_at:new Date().toISOString().slice(0,10)} });
    }

    if (body.action === 'add_asset_reflection') {
      const assetId=String(body.assetId??'');const asset=await db.prepare(`SELECT * FROM assets WHERE id = ?`).bind(assetId).first<Asset>();if(!asset)return Response.json({error:'没有找到这个物资'},{status:404});
      let reflectionInput:ReturnType<typeof parseAssetReflectionPayload>;
      try{reflectionInput=parseAssetReflectionPayload(body)}catch(error){if(error instanceof AssetRuleError)return Response.json({error:error.message},{status:error.status});throw error}
      const {feeling,rating,wouldBuyAgain,note,trigger}=reflectionInput;
      const createdAt=new Date().toISOString();
      const reflection:AssetReflection={id:crypto.randomUUID(),asset_id:asset.id,asset_name:asset.name,asset_type:asset.type,feeling,rating,would_buy_again:wouldBuyAgain,note,trigger,usage_count:asset.usage_count,cost_per_use:costPerUse(asset),created_at:createdAt};
      const userId='owner-preview';const idempotencyKey=`asset_reflection:${asset.id}`;const existing=await db.prepare(`SELECT id FROM growth_ledger_entries WHERE idempotency_key = ?`).bind(idempotencyKey).first();const account=await db.prepare(`SELECT points FROM growth_accounts WHERE user_id = ?`).bind(userId).first<{points:number}>();const points=Number(account?.points??0)+(existing?0:15);const level=points>=700?4:points>=300?3:points>=100?2:1;
      const statements=[db.prepare(`INSERT INTO asset_reflections (id,asset_id,asset_name,asset_type,feeling,rating,would_buy_again,note,trigger,usage_count,cost_per_use,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(reflection.id,reflection.asset_id,reflection.asset_name,reflection.asset_type,reflection.feeling,reflection.rating??null,reflection.would_buy_again,reflection.note,reflection.trigger,reflection.usage_count,reflection.cost_per_use,reflection.created_at)];
      if(trigger!=='MANUAL')statements.push(db.prepare(`UPDATE assets SET archived_at = COALESCE(archived_at, ?) WHERE id = ?`).bind(createdAt,asset.id));
      if(!existing){statements.push(db.prepare(`INSERT INTO growth_accounts (user_id,points,level) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET points=excluded.points,level=excluded.level`).bind(userId,points,level));statements.push(db.prepare(`INSERT INTO growth_ledger_entries (id,user_id,points,idempotency_key,reason) VALUES (?,?,?,?,?)`).bind(crypto.randomUUID(),userId,15,idempotencyKey,'asset_reflection'))}
      await db.batch(statements);const updatedAsset=await db.prepare(`SELECT * FROM assets WHERE id = ?`).bind(asset.id).first<Asset>();return Response.json({reflection,asset:updatedAsset},{status:201});
    }

    if (body.action === 'save_decision_note') {
      const requestId = String(body.requestId ?? '');
      const note = String(body.note ?? '').trim().slice(0, 2000);
      await db.prepare(`UPDATE purchase_requests SET decision_note = ? WHERE id = ?`).bind(note, requestId).run();
      return Response.json({ ok: true });
    }

    if (body.action === 'decide') {
      const decision = String(body.decision) as ReviewChoice;
      if (!['BUY_NOW','SAVE_FIRST','WAIT'].includes(decision)) return Response.json({ error: '无效决定' }, { status: 400 });
      const requestId = String(body.requestId ?? '');
      const source = await db.prepare(`SELECT * FROM purchase_requests WHERE id = ?`).bind(requestId).first<Record<string, unknown>>();
      if (!source || source.status !== 'REVIEWING') return Response.json({ error: '这个心愿已经完成决定' }, { status: 409 });
      const status = decision === 'BUY_NOW' ? 'PURCHASED' : decision === 'SAVE_FIRST' ? 'SAVING' : 'ARCHIVED';
      const statements = [
        db.prepare(`UPDATE purchase_requests SET status = ? WHERE id = ? AND status = 'REVIEWING'`).bind(status, requestId),
        db.prepare(`INSERT INTO final_decisions (request_id,decision) VALUES (?,?) ON CONFLICT(request_id) DO UPDATE SET decision=excluded.decision, decided_at=CURRENT_TIMESTAMP`).bind(requestId, decision),
        db.prepare(`UPDATE review_invites SET revoked = 1 WHERE request_id = ?`).bind(requestId),
      ];
      const note = String(body.note ?? '').trim().slice(0, 2000);
      if (note) statements.push(db.prepare(`UPDATE purchase_requests SET decision_note = ? WHERE id = ?`).bind(note, requestId));
      await db.batch(statements);
      if (decision === 'SAVE_FIRST') {
        await db.prepare(`INSERT OR IGNORE INTO saving_goals (id,request_id,name,target,current) VALUES (?,?,?,?,0)`).bind(`saving-${requestId}`, requestId, String(source.name), Number(source.price)).run();
      }
      if (decision === 'BUY_NOW') {
        const type = assetTypeForWish(source.type as WishType,String(source.category??''));
        await db.prepare(`INSERT OR IGNORE INTO assets (id,request_id,name,type,purchase_price,total_units,used_units,current_balance,expiry_date,usage_count) VALUES (?,?,?,?,?,?,0,?,?,0)`)
          .bind(`asset-${requestId}`, requestId, String(source.name), type, Number(source.price), type === 'EXPERIENCE' ? 1 : source.total_units ?? null, type === 'STORED_VALUE' ? Number(source.price) : null, source.expiry_date ?? null).run();
      }
      const goal=decision==='SAVE_FIRST'?await db.prepare(`SELECT * FROM saving_goals WHERE request_id = ?`).bind(requestId).first():null;const asset=decision==='BUY_NOW'?await db.prepare(`SELECT * FROM assets WHERE request_id = ?`).bind(requestId).first():null;
      return Response.json({ ok: true, target: decision === 'BUY_NOW' ? 'assets' : decision === 'SAVE_FIRST' ? 'saving' : 'wishes',goal,asset });
    }

    return Response.json({ error: '不支持的操作' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '操作失败' }, { status: error instanceof LocalStoreError||error instanceof AssetRuleError ? error.status : 500 });
  }
}
