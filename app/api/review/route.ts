import { getDb } from '@/lib/server/db';
import { isCloudBaseServerConfigured } from '@/lib/server/cloudbase';
import { CloudBaseStoreError, getCloudBaseReview, submitCloudBaseReview } from '@/lib/server/cloudbase-store';
import { getLocalReview, isLocalPreview, LocalStoreError, submitLocalReview } from '@/lib/server/local-store';
import { normalizeWish } from '@/lib/wish-compat';
import type { ReviewChoice, ReviewStamp, ReviewLinkState } from '@/lib/types';
import { digestClaimToken } from '@/lib/server/claim-token';

export const dynamic = 'force-dynamic';

const stampToChoice: Record<ReviewStamp, ReviewChoice> = {
  FITS: 'BUY_NOW', CONDITIONAL: 'SAVE_FIRST', WAIT: 'WAIT', NOT_FIT: 'WAIT', NEED_INFO: 'WAIT',
};

function fail(error: string, status: number, code?: string) {
  return Response.json({ error, code }, { status });
}

export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get('token');
    if (!token) return fail('链接不完整', 400, 'REVIEW_LINK_INVALID');
    if (isCloudBaseServerConfigured()) return Response.json(await getCloudBaseReview(token));
    if (isLocalPreview(request)) return Response.json(getLocalReview(token));
    const db = await getDb();
    const row = await db.prepare(`
      SELECT i.id AS invite_id, i.used_at, i.revoked,
        p.id, p.name, p.price, p.reason, p.category, p.type, p.concern, p.brand, p.sku_label, p.details,
        p.source_platform, p.product_url, p.similar_item, p.image_url AS image_url_col,
        p.total_units, p.usage_frequency, p.expiry_date, p.status, p.revision, p.updated_at
      FROM review_invites i
      JOIN purchase_requests p ON p.id = i.request_id
      WHERE i.token = ?
    `).bind(token).first<Record<string, unknown>>();
    if (!row) return fail('链接不存在或已撤销', 404, 'REVIEW_LINK_NOT_FOUND');
    let linkState: ReviewLinkState = 'ACTIVE';
    if (row.revoked) linkState = 'REVOKED';
    else if (row.status !== 'REVIEWING') linkState = 'REQUEST_DECIDED';
    if (linkState !== 'ACTIVE') return fail('这张邀请卡已经完成使命了', 410, linkState);
    const imageRows = await db.prepare(`SELECT id,url,sort_order,is_cover FROM wish_images WHERE request_id = ? ORDER BY sort_order ASC`).bind(String(row.id)).all();
    row.images = (imageRows.results ?? []).map((image, index) => ({ id: String(image.id ?? index), url: String(image.url ?? ''), sortOrder: Number(image.sort_order ?? index), isCover: Boolean(image.is_cover) }));
    const wish = normalizeWish(row);
    const requestSubset = {
      id: wish.id, name: wish.name, price: wish.price, type: wish.type, reason: wish.reason,
      concern: wish.concern, brand: wish.brand, skuLabel: wish.skuLabel, details: wish.details,
      sourcePlatform: wish.sourcePlatform, productUrl: wish.productUrl, images: wish.images,
      revision: wish.revision,
    };
    return Response.json({ request: requestSubset, ownerDisplay: null, linkState: 'ACTIVE' });
  } catch (error) {
    const status = error instanceof LocalStoreError || error instanceof CloudBaseStoreError ? error.status : 500;
    const code = error instanceof LocalStoreError ? error.code : error instanceof CloudBaseStoreError ? (error as {code?:string}).code : undefined;
    return fail(error instanceof Error ? error.message : '加载失败', status, code);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { token?:string; reviewerName?:string; reviewerRole?:string; stamp?:ReviewStamp; reasons?:string[]; note?:string; choice?:ReviewChoice; comment?:string };
    if (!body.token) return fail('链接不完整', 400, 'REVIEW_LINK_INVALID');
    if (!body.stamp && !body.choice) return fail('请完成判断章', 400, 'REVIEW_STAMP_REQUIRED');
    const name = (body.reviewerName?.trim() || '匿名朋友').slice(0, 20);
    const reasons = Array.isArray(body.reasons) ? body.reasons.filter(Boolean) : [];
    const note = body.note ? String(body.note).slice(0, 80) : '';
    if (body.stamp && !body.choice) body.choice = stampToChoice[body.stamp];
    if (!body.comment) {
      const parts = [reasons.join('；'), note ? `备注：${note}` : ''].filter(Boolean);
      body.comment = parts.join('\n');
    }
    if (!body.comment?.trim()) return fail('请完成理由', 400, 'REVIEW_REASONS_REQUIRED');

    if (isCloudBaseServerConfigured()) return Response.json(await submitCloudBaseReview(body), { status: 201 });
    if (isLocalPreview(request)) return Response.json(submitLocalReview(body), { status: 201 });

    // D1 path
    const db = await getDb();
    const invite = await db.prepare(`SELECT i.id, i.request_id, p.status, p.revision FROM review_invites i JOIN purchase_requests p ON p.id = i.request_id WHERE i.token = ? AND i.revoked = 0`).bind(body.token).first<{ id: string; request_id: string; status: string; revision: number }>();
    if (!invite) return fail('链接不存在或已撤销', 404, 'REVIEW_LINK_NOT_FOUND');
    if (invite.status !== 'REVIEWING') return fail('这个心愿已经完成决定', 410, 'REQUEST_DECIDED');
    const reviewId = crypto.randomUUID();
    const claimToken = crypto.randomUUID().replaceAll('-', '');
    const wishRow = await db.prepare(`SELECT name, price, type, reason, concern FROM purchase_requests WHERE id = ?`).bind(invite.request_id).first<Record<string, unknown>>();
    const snapshot = JSON.stringify({ name: wishRow?.name ?? '', price: wishRow?.price ?? 0, type: wishRow?.type ?? 'OTHER', reason: wishRow?.reason ?? '', concern: wishRow?.concern ?? '' });
    await db.prepare(`INSERT INTO reviews (id, request_id, reviewer_name, choice, comment, reviewer_role, stamp, reasons, note, request_revision, wish_snapshot, legacy_context) VALUES (?,?,?,?,?,?,?,?,?,?,?,0)`).bind(reviewId, invite.request_id, name, body.choice, body.comment.slice(0, 500), body.reviewerRole ?? null, body.stamp ?? null, JSON.stringify(reasons), note || null, invite.revision, snapshot).run();
    await db.prepare(`INSERT INTO claim_tokens (token_digest, review_id, expires_at, status) VALUES (?,?,?,?)`).bind(await digestClaimToken(claimToken), reviewId, new Date(Date.now() + 86_400_000).toISOString(), 'PENDING').run();
    await db.prepare(`UPDATE purchase_requests SET review_count = review_count + 1 WHERE id = ?`).bind(invite.request_id).run();
    return Response.json({ reviewId, claimToken, successText: '感谢你的真实视角，已送到朋友手里。' }, { status: 201 });
  } catch (error) {
    const status = error instanceof LocalStoreError || error instanceof CloudBaseStoreError ? error.status : 500;
    const code = error instanceof LocalStoreError ? error.code : error instanceof CloudBaseStoreError ? (error as { code?: string }).code : undefined;
    return fail(error instanceof Error ? error.message : '提交失败', status, code);
  }
}
