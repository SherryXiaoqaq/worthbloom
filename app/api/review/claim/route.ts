import { getDb } from '@/lib/server/db';
import { isCloudBaseServerConfigured } from '@/lib/server/cloudbase';
import { CloudBaseStoreError } from '@/lib/server/cloudbase-store';
import { getCloudBaseDb } from '@/lib/server/cloudbase-http-db';
import { claimLocalReview, isLocalPreview, LocalStoreError } from '@/lib/server/local-store';
import { requireCloudBaseUser, CloudBaseAuthError } from '@/lib/server/cloudbase-auth';
import { isOwnerRequest } from '@/lib/server/owner';

export const dynamic = 'force-dynamic';

function fail(error: string, status: number, code?: string) {
  return Response.json({ error, code }, { status });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { reviewId?: string; claimToken?: string };
    if (!body.reviewId || !body.claimToken) return fail('参数不完整', 400, 'CLAIM_INVALID');

    // Resolve caller identity
    let userId: string;
    if (isCloudBaseServerConfigured()) {
      const user = await requireCloudBaseUser(request);
      userId = user.id;
    } else if (isOwnerRequest(request.headers)) {
      userId = 'owner-preview';
    } else {
      return fail('请先登录', 401, 'AUTH_REQUIRED');
    }

    if (isLocalPreview(request) && !isCloudBaseServerConfigured()) {
      return Response.json(claimLocalReview(body.reviewId, body.claimToken, userId));
    }

    if (isCloudBaseServerConfigured()) {
      const db = getCloudBaseDb();
      // Look up the claim token doc
      const claimDocs = await db.collection('claim_tokens').where({ token_digest: body.claimToken }).limit(1).get();
      const claim = (claimDocs.data || [])[0] as Record<string, unknown> | undefined;
      if (!claim || String(claim.review_id) !== body.reviewId) return fail('认领凭据无效', 410, 'CLAIM_EXPIRED');
      if (claim.status === 'CLAIMED') {
        return Response.json({ claimed: true, pointsAwarded: 0, dailyLimitReached: false, growthAccount: { userId, points: 0, level: 1 } });
      }
      if (new Date(String(claim.expires_at)).getTime() < Date.now()) return fail('认领凭据已过期', 410, 'CLAIM_EXPIRED');
      // Owner 403: check if claimer is the wish owner
      const reviewDoc = (await db.collection('reviews').doc(body.reviewId).get()).data?.[0] as Record<string, unknown> | undefined;
      if (reviewDoc && String(reviewDoc.owner_id) === userId) return fail('心愿主人不能认领自己的回信', 403, 'CLAIM_OWNER_FORBIDDEN');
      // Daily limit: max 3 reviews/day for base points
      const todayStr = new Date().toISOString().slice(0, 10);
      const todayEntries = (await db.collection('growth_ledger').where({ user_id: userId }).get()).data as Record<string, unknown>[] || [];
      const todayCount = todayEntries.filter(e => String(e.created_at || '').startsWith(todayStr)).length;
      const idempotencyKey = `claim:${body.reviewId}`;
      const existing = todayEntries.find(e => String(e.idempotency_key) === idempotencyKey);
      if (existing) {
        return Response.json({ claimed: true, pointsAwarded: Number(existing.points), dailyLimitReached: false, growthAccount: { userId, points: 0, level: 1 } });
      }
      const pointsAwarded = todayCount >= 3 ? 0 : 10;
      await db.collection('claim_tokens').doc(body.claimToken).update({ status: 'CLAIMED' });
      const acctDoc = (await db.collection('growth_accounts').doc(userId).get()).data?.[0] as Record<string, unknown> | undefined;
      const newPoints = Number(acctDoc?.points ?? 0) + pointsAwarded;
      if (acctDoc) await db.collection('growth_accounts').doc(userId).update({ points: newPoints });
      else await db.collection('growth_accounts').doc(userId).set({ user_id: userId, points: newPoints, level: 1 });
      await db.collection('growth_ledger').doc(crypto.randomUUID()).set({ user_id: userId, points: pointsAwarded, idempotency_key: idempotencyKey, reason: 'review_claim', created_at: new Date().toISOString() });
      return Response.json({ claimed: true, pointsAwarded, dailyLimitReached: todayCount >= 3, growthAccount: { userId, points: newPoints, level: Number(acctDoc?.level ?? 1) } });
    }

    // D1 path
    const db = await getDb();
    const claim = await db.prepare(`SELECT review_id, expires_at, status FROM claim_tokens WHERE token_digest = ?`).bind(body.claimToken).first<{ review_id: string; expires_at: string; status: string }>();
    if (!claim || claim.review_id !== body.reviewId) return fail('认领凭据无效', 410, 'CLAIM_EXPIRED');
    if (claim.status === 'CLAIMED') {
      return Response.json({ claimed: true, pointsAwarded: 0, dailyLimitReached: false, growthAccount: { userId, points: 0, level: 1 } });
    }
    if (new Date(claim.expires_at).getTime() < Date.now()) return fail('认领凭据已过期', 410, 'CLAIM_EXPIRED');
    const idempotencyKey = `claim:${body.reviewId}`;
    const existing = await db.prepare(`SELECT id, points FROM growth_ledger_entries WHERE idempotency_key = ?`).bind(idempotencyKey).first<{ id: string; points: number }>();
    if (existing) {
      return Response.json({ claimed: true, pointsAwarded: existing.points, dailyLimitReached: false, growthAccount: { userId, points: existing.points, level: 1 } });
    }
    await db.batch([
      db.prepare(`UPDATE claim_tokens SET status = 'CLAIMED' WHERE token_digest = ?`).bind(body.claimToken),
      db.prepare(`INSERT INTO growth_accounts (user_id, points, level) VALUES (?, 10, 1) ON CONFLICT(user_id) DO UPDATE SET points = points + 10`).bind(userId),
      db.prepare(`INSERT INTO growth_ledger_entries (id, user_id, points, idempotency_key, reason) VALUES (?,?,?,?,?)`).bind(crypto.randomUUID(), userId, 10, idempotencyKey, 'review_claim'),
    ]);
    const account = await db.prepare(`SELECT points, level FROM growth_accounts WHERE user_id = ?`).bind(userId).first<{ points: number; level: number }>();
    return Response.json({ claimed: true, pointsAwarded: 10, dailyLimitReached: false, growthAccount: { userId, points: account?.points ?? 10, level: account?.level ?? 1 } });
  } catch (error) {
    const status = error instanceof LocalStoreError || error instanceof CloudBaseStoreError || error instanceof CloudBaseAuthError ? error.status : 500;
    const code = error instanceof LocalStoreError ? error.code : error instanceof CloudBaseStoreError ? (error as { code?: string }).code : undefined;
    return fail(error instanceof Error ? error.message : '认领失败', status, code);
  }
}
