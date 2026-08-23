import { getDb } from '@/lib/server/db';
import { isCloudBaseServerConfigured } from '@/lib/server/cloudbase';
import { CloudBaseStoreError, getCloudBaseReview, submitCloudBaseReview } from '@/lib/server/cloudbase-store';
import { getLocalReview, isLocalPreview, LocalStoreError, submitLocalReview } from '@/lib/server/local-store';
import type { ReviewChoice } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get('token');
    if (!token) return Response.json({ error: '链接不完整' }, { status: 400 });
    if (isCloudBaseServerConfigured()) return Response.json(await getCloudBaseReview(token));
    if (isLocalPreview(request)) return Response.json(getLocalReview(token));
    const db = await getDb();
    const invite = await db.prepare(`
      SELECT i.id AS invite_id,i.used_at,i.revoked,
        p.id,p.name,p.price,p.reason,p.category,p.total_units,p.usage_frequency,p.expiry_date,p.product_url,p.similar_item,p.status
      FROM review_invites i
      JOIN purchase_requests p ON p.id = i.request_id
      WHERE i.token = ?
    `).bind(token).first<Record<string, unknown>>();
    if (!invite) return Response.json({ error: '链接不存在或已撤销' }, { status: 404 });
    if (invite.revoked || invite.used_at || invite.status !== 'REVIEWING') return Response.json({ error: '这张邀请卡已经完成使命了' }, { status: 410 });
    const wish = { ...invite };
    delete wish.invite_id;
    delete wish.used_at;
    delete wish.revoked;
    return Response.json({ request: wish });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '加载失败' }, { status: error instanceof LocalStoreError || error instanceof CloudBaseStoreError ? error.status : 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { token?:string; reviewerName?:string; choice?:ReviewChoice; comment?:string };
    const name = body.reviewerName?.trim();
    const comment = body.comment?.trim();
    if (!body.token || !name || !comment || !body.choice || !['BUY_NOW','SAVE_FIRST','WAIT'].includes(body.choice)) {
      return Response.json({ error: '请完成昵称、建议和原因' }, { status: 400 });
    }
    if (isCloudBaseServerConfigured()) return Response.json(await submitCloudBaseReview(body), { status: 201 });
    if (isLocalPreview(request)) return Response.json(submitLocalReview(body), { status: 201 });
    const db = await getDb();
    const invite = await db.prepare(`
      SELECT i.id,i.request_id,p.status
      FROM review_invites i
      JOIN purchase_requests p ON p.id = i.request_id
      WHERE i.token = ? AND i.revoked = 0 AND i.used_at IS NULL
    `).bind(body.token).first<{id:string;request_id:string;status:string}>();
    if (!invite || invite.status !== 'REVIEWING') return Response.json({ error: '这张邀请卡已使用或心愿已结束' }, { status: 409 });
    const claimed = await db.prepare(`UPDATE review_invites SET used_by = ?, used_at = CURRENT_TIMESTAMP WHERE id = ? AND used_at IS NULL AND revoked = 0`)
      .bind(name.slice(0, 20), invite.id).run();
    if (!claimed.meta.changes) return Response.json({ error: '这张邀请卡刚刚已经被使用了' }, { status: 409 });
    await db.prepare(`INSERT INTO reviews (id,request_id,reviewer_name,choice,comment) VALUES (?,?,?,?,?)`)
      .bind(crypto.randomUUID(), invite.request_id, name.slice(0, 20), body.choice, comment.slice(0, 500)).run();
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '提交失败' }, { status: error instanceof LocalStoreError || error instanceof CloudBaseStoreError ? error.status : 500 });
  }
}
