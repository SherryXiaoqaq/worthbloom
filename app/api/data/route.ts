import { getDb } from '@/lib/server/db';
import { CloudBaseAuthError, requireCloudBaseUser } from '@/lib/server/cloudbase-auth';
import { isCloudBaseServerConfigured } from '@/lib/server/cloudbase';
import { CloudBaseStoreError, handleCloudBaseDataAction, loadCloudBaseData } from '@/lib/server/cloudbase-store';
import { getLocalData, handleLocalDataAction, isLocalPreview, LocalStoreError } from '@/lib/server/local-store';
import { isOwnerRequest, ownerOnly } from '@/lib/server/owner';
import type { Asset, ReviewChoice } from '@/lib/types';

export const dynamic = 'force-dynamic';

const assetTypes: Asset['type'][] = ['COURSE', 'MEMBERSHIP', 'STORED_VALUE', 'ITEM'];

function requestType(category: string): Asset['type'] {
  if (category.includes('课程')) return 'COURSE';
  if (category.includes('会员')) return 'MEMBERSHIP';
  if (category.includes('储值')) return 'STORED_VALUE';
  return 'ITEM';
}

function inviteToken() {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 20);
}

async function loadData() {
  const db = await getDb();
  const [requests, reviews, invites, savingGoals, assets] = await Promise.all([
    db.prepare(`SELECT p.*, COUNT(r.id) AS review_count FROM purchase_requests p LEFT JOIN reviews r ON r.request_id = p.id GROUP BY p.id ORDER BY p.created_at DESC`).all(),
    db.prepare(`SELECT * FROM reviews ORDER BY created_at DESC`).all(),
    db.prepare(`SELECT * FROM review_invites ORDER BY created_at ASC`).all(),
    db.prepare(`SELECT * FROM saving_goals ORDER BY created_at DESC`).all(),
    db.prepare(`SELECT * FROM assets ORDER BY created_at DESC`).all(),
  ]);
  return { requests: requests.results, reviews: reviews.results, invites: invites.results, savingGoals: savingGoals.results, assets: assets.results };
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
      return Response.json(output, { status: body.action === 'create_request' || body.action === 'create_invite' || body.action === 'add_asset' ? 201 : 200 });
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
      const payload = body.payload as Record<string, string | number | null>;
      const id = crypto.randomUUID();
      const token = crypto.randomUUID().replaceAll('-', '');
      const name = String(payload.name ?? '').trim();
      const reason = String(payload.reason ?? '').trim();
      const price = Number(payload.price);
      if (!name || !reason || !Number.isFinite(price) || price < 0) return Response.json({ error: '请完整填写名称、价格和理由' }, { status: 400 });
      await db.prepare(`INSERT INTO purchase_requests (id,name,price,reason,category,total_units,usage_frequency,expiry_date,product_url,similar_item,status,review_token) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(id, name, price, reason, String(payload.category ?? '其他'), payload.total_units ?? null, payload.usage_frequency || null, payload.expiry_date || null, payload.product_url || null, payload.similar_item || null, 'REVIEWING', token).run();
      const inviteStatements = [1, 2, 3].map(n => db.prepare(`INSERT INTO review_invites (id,request_id,token,label) VALUES (?,?,?,?)`).bind(crypto.randomUUID(), id, inviteToken(), `朋友 ${n}`));
      await db.batch(inviteStatements);
      const row = await db.prepare(`SELECT p.*, 0 AS review_count FROM purchase_requests p WHERE id = ?`).bind(id).first();
      const invites = await db.prepare(`SELECT * FROM review_invites WHERE request_id = ? ORDER BY created_at`).bind(id).all();
      return Response.json({ request: row, invites: invites.results }, { status: 201 });
    }

    if (body.action === 'create_invite') {
      const requestId = String(body.requestId ?? '');
      const source = await db.prepare(`SELECT id,status FROM purchase_requests WHERE id = ?`).bind(requestId).first<{id:string;status:string}>();
      if (!source || source.status !== 'REVIEWING') return Response.json({ error: '这个心愿已经结束征集' }, { status: 409 });
      const count = await db.prepare(`SELECT COUNT(*) AS total FROM review_invites WHERE request_id = ?`).bind(requestId).first<{total:number}>();
      const id = crypto.randomUUID();
      await db.prepare(`INSERT INTO review_invites (id,request_id,token,label) VALUES (?,?,?,?)`).bind(id, requestId, inviteToken(), `朋友 ${(count?.total ?? 0) + 1}`).run();
      return Response.json({ invite: await db.prepare(`SELECT * FROM review_invites WHERE id = ?`).bind(id).first() }, { status: 201 });
    }

    if (body.action === 'revoke_invite') {
      await db.prepare(`UPDATE review_invites SET revoked = 1 WHERE id = ? AND used_at IS NULL`).bind(String(body.inviteId ?? '')).run();
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
      const type = source ? requestType(String(source.category)) : 'ITEM';
      const assetId = requestId ? `asset-${requestId}` : `asset-${goalId}`;
      const assetStatements = [
        db.prepare(`INSERT OR IGNORE INTO assets (id,request_id,name,type,purchase_price,total_units,used_units,current_balance,expiry_date,usage_count) VALUES (?,?,?,?,?,?,0,?,?,0)`)
          .bind(assetId, requestId, String(goal.name), type, Number(goal.target), source?.total_units ?? null, type === 'STORED_VALUE' ? Number(goal.target) : null, source?.expiry_date ?? null),
        db.prepare(`DELETE FROM saving_goals WHERE id = ?`).bind(goalId),
      ];
      if (requestId) assetStatements.unshift(db.prepare(`UPDATE purchase_requests SET status = 'PURCHASED' WHERE id = ?`).bind(requestId));
      await db.batch(assetStatements);
      const asset = await db.prepare(`SELECT * FROM assets WHERE id = ?`).bind(assetId).first();
      return Response.json({ goal, completed: true, asset });
    }

    if (body.action === 'add_asset') {
      const payload = body.payload as Record<string, string | number | null>;
      const name = String(payload.name ?? '').trim();
      const type = String(payload.type ?? 'ITEM') as Asset['type'];
      const price = Number(payload.purchase_price);
      if (!name || !assetTypes.includes(type) || !Number.isFinite(price) || price < 0) return Response.json({ error: '请完整填写物资名称、类型和购入金额' }, { status: 400 });
      const id = crypto.randomUUID();
      const totalUnits = payload.total_units === null || payload.total_units === '' ? null : Math.max(0, Number(payload.total_units));
      const usedUnits = Math.max(0, Number(payload.used_units ?? 0));
      const usageCount = Math.max(0, Number(payload.usage_count ?? usedUnits));
      const balance = payload.current_balance === null || payload.current_balance === '' ? null : Math.max(0, Number(payload.current_balance));
      await db.prepare(`INSERT INTO assets (id,name,type,purchase_price,total_units,used_units,current_balance,expiry_date,usage_count,last_used_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .bind(id, name, type, price, totalUnits, usedUnits, balance, payload.expiry_date || null, usageCount, usageCount ? new Date().toISOString().slice(0, 10) : null).run();
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
      const eventId = crypto.randomUUID();
      await db.batch([
        db.prepare(`UPDATE assets SET used_units = CASE WHEN total_units IS NULL THEN used_units ELSE MIN(total_units, used_units + 1) END, usage_count = usage_count + 1, last_used_at = date('now') WHERE id = ?`).bind(assetId),
        db.prepare(`INSERT INTO usage_records (id,asset_id,usage_type,client_event_id) VALUES (?,?,?,?)`).bind(crypto.randomUUID(), assetId, 'USED_TODAY', eventId),
      ]);
      return Response.json({ ok: true });
    }

    if (body.action === 'decide') {
      const decision = String(body.decision) as ReviewChoice;
      if (!['BUY_NOW','SAVE_FIRST','WAIT'].includes(decision)) return Response.json({ error: '无效决定' }, { status: 400 });
      const requestId = String(body.requestId ?? '');
      const source = await db.prepare(`SELECT * FROM purchase_requests WHERE id = ?`).bind(requestId).first<Record<string, unknown>>();
      if (!source || source.status !== 'REVIEWING') return Response.json({ error: '这个心愿已经完成决定' }, { status: 409 });
      const status = decision === 'BUY_NOW' ? 'PURCHASED' : decision === 'SAVE_FIRST' ? 'SAVING' : 'ARCHIVED';
      await db.batch([
        db.prepare(`UPDATE purchase_requests SET status = ? WHERE id = ? AND status = 'REVIEWING'`).bind(status, requestId),
        db.prepare(`INSERT INTO final_decisions (request_id,decision) VALUES (?,?) ON CONFLICT(request_id) DO UPDATE SET decision=excluded.decision, decided_at=CURRENT_TIMESTAMP`).bind(requestId, decision),
        db.prepare(`UPDATE review_invites SET revoked = 1 WHERE request_id = ? AND used_at IS NULL`).bind(requestId),
      ]);
      if (decision === 'SAVE_FIRST') {
        await db.prepare(`INSERT OR IGNORE INTO saving_goals (id,request_id,name,target,current) VALUES (?,?,?,?,0)`).bind(`saving-${requestId}`, requestId, String(source.name), Number(source.price)).run();
      }
      if (decision === 'BUY_NOW') {
        const type = requestType(String(source.category));
        await db.prepare(`INSERT OR IGNORE INTO assets (id,request_id,name,type,purchase_price,total_units,used_units,current_balance,expiry_date,usage_count) VALUES (?,?,?,?,?,?,0,?,?,0)`)
          .bind(`asset-${requestId}`, requestId, String(source.name), type, Number(source.price), source.total_units ?? null, type === 'STORED_VALUE' ? Number(source.price) : null, source.expiry_date ?? null).run();
      }
      return Response.json({ ok: true, target: decision === 'BUY_NOW' ? 'assets' : decision === 'SAVE_FIRST' ? 'saving' : 'wishes' });
    }

    return Response.json({ error: '不支持的操作' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '操作失败' }, { status: error instanceof LocalStoreError ? error.status : 500 });
  }
}
